'use strict';

var _ = require('lodash');
var str = require('underscore.string');
var cors = require('cors');
var morgan = require('morgan');
var mongodb = require('mongodb');
var through = require('through2');
var express = require('express');
var JSONStream = require('JSONStream');
var bodyParser = require('body-parser');
var compression = require('compression');
var methodOverride = require('method-override');
var gridform = require('gridform');
var config = require('config');
var gfs = gridform.gridfsStream;
var githubWebhookMiddleware = require('github-webhook-middleware')({
  secret: process.env.GITHUB_SECRET
});
var bitbucketWebhookMiddleware = require('./bitbucketWebhookMiddleware');
var schema = require('./schema');
var pkg = require('../package');
var mongoQueries = require('./MongoQueries');
var MongoClient = mongodb.MongoClient;
var port = process.env.PORT || 3232;
var app = express();
var dbHost = process.env.MONGO_HOST || 'localhost';
var dbName = 'inhouse';
var db;

app.use(methodOverride());
app.use(morgan('combined'));
app.use(cors());
app.use(compression());

app.use(function (req, res, next) {
  // Set nice X-Powered-By header, instead of the default:
  res.setHeader('X-Powered-By', pkg.name + ' v.' + pkg.version);
  // Everything is JSON:
  res.type('json');
  // Attach database to request:
  req.db = db;
  next();
});

app.use(function (req, res, next) {
  req.exp = mongoQueries.queryToMongoExpressions(req);
  next();
});

/**
 * POST /upload
 * Handles file storage
 */
app.post('/upload', function (req, res) {
  var form = gridform();
  form.parse(req, function(err, fields, files) {
    if (err) {
      return res.status(500).send(err);
    }
    return res.status(200).send(files.upload.id);

  });
});

/**
 * POST /upload/:id
 * Handles file storage retrieval
 */
app.get('/upload/:name', function (req, res) {
  var stream = gfs.createReadStream({
    filename: req.params.name
  });

  //error handling, e.g. file does not exist
  stream.on('error', function (err) {
    res.status(400).send(err);
  });

  res.set('Content-Type', 'image/png')
  stream.pipe(res);
});

// Activate body parser for remaining routes
app.use(bodyParser.json());

/**
 * GitHub Webhook endpoint
 *
 * Adds incoming repo to build queue
 *
 * POST /_hook/github/:endpoint
 */
app.post('/_hook/github/:endpoint?', githubWebhookMiddleware, function (req, res) {
  var hooks = req.db.collection('_hook');
  var buildqueue = req.db.collection('buildqueue');

  hooks.insert(req.body, function(err) {
    if (err) {
      return res.status(500).send(err);
    }
    if (!req.body.ref) {
      // Skipping hook if no ref was found (it's maybe a ping)
      return res.sendStatus(204);
    }
    if (req.body.ref !== 'refs/heads/master') {
      // Skipping hook if it's a push for something else than the master branch
      return res.sendStatus(204);
    }
    var build = {
      fullName: req.body.repository.full_name,
      name: req.body.repository.name,
      repo: req.body.repository.clone_url,
      commit: req.body.head_commit && req.body.head_commit.id,
      endpoint: req.params.endpoint,
      createdAt: new Date(),
      buildAt: null,
      nrOfAttempts: 0,
      isSuccessful: false,
      message: null,
      pusher: req.body.pusher
    };
    buildqueue.insert(build, function (err) {
      if (err) {
        return res.status(500).send(err);
      }
      return res.sendStatus(201);
    });
  });
});

/**
 * BitBucket Webhook endpoint
 *
 * Adds incoming repo to build queue
 *
 * POST /_hook/bitbucket/:endpoint
 */
app.post('/_hook/bitbucket/:endpoint?', bitbucketWebhookMiddleware, function (req, res) {
  var hooks = req.db.collection('_hook');
  var buildqueue = req.db.collection('buildqueue');
  hooks.insert(req.body, function(err) {
    if (err) {
      return res.status(500).send(err);
    }
    if (!req.body.push) {
      // Skipping hook if no ref was found (it's maybe a ping)
      return res.sendStatus(204);
    }
    if (!req.body.push.changes.length || req.body.push.changes[0]['new'].name !== 'master') {
      // Skipping hook if it's a push for something else than the master branch
      return res.sendStatus(204);
    }
    if(!config.repositories[req.body.repository.full_name]) {
      return res.status(500).send(new Error('No matching repository in the config'));
    }

    var push = req.body.push.changes[0]; //look at the latest
    var build = {
      fullName: req.body.repository.full_name,
      name: req.body.repository.name,
      repo: config.repositories[req.body.repository.full_name].clone_url,
      commit: !!push.commits.length,
      endpoint: req.params.endpoint,
      createdAt: new Date(),
      buildAt: null,
      nrOfAttempts: 0,
      isSuccessful: false,
      message: null,
      pusher: req.body.actor
    };

    buildqueue.insert(build, function (err) {
      if (err) {
        return res.status(500).send(err);
      }
      return res.sendStatus(201);
    });
  });
});

/**
 * Attach current resource name and collection to the request
 * from the url parameter `:resource`
 */
app.param('resource', function (req, res, next, resource) {
  req.resource = str.camelize(resource);
  req.collection = req.db.collection(req.resource);
  next();
});

/**
 * Attach current main resource name to the request
 * from the url parameter `:mainResource`
 */
app.param('mainResource', function (req, res, next, mainResource) {
  req.parentField = str.camelize(mainResource) + 'Id';
  next();
});

/**
 * Convert given url parameter `:id` to an ObjectID
 * and respond with 400 Bad Request if malformed.
 */
app.param('id', function (req, res, next, id) {
  try {
    req.id = new mongodb.ObjectID(id);
  } catch (e) {
    return res.status(400).send({
      error: true,
      message: 'ID must be a single String of 12 bytes or a string of 24 hex character'
    });
  }
  next();
});

/**
 * Add indices to specified resource.
 *
 * POST  /_indices/:resource
 */
app.post('/_indices/:resource', function(req, res) {
  if (!req.body) {
    return res.status(400).send();
  }
  try {
    req.collection.ensureIndex(req.body, req.query, function(err, index) {
      if (err) {
        return res.status(500).send(err);
      }
      return res.sendStatus(201);
    });
  } catch (e) {
    return res.status(400).send({
        error: true,
        message: 'Indice object >' + req.body + '< is not correct, please lookup documentation.'
    });
  }
});

/**
 * Deletes all indices on specified resource.
 *
 * DELETE /_indices/:resource
 */
app.delete('/_indices/:resource', function(req, res) {

  req.collection.dropIndexes(function(err) {
    if (err) {
      return res.status(500).send(err);
    }

    return res.sendStatus(204);
  });
});

/**
 * GET /_collection
 */
app.get('/_collection', function (req, res) {
  db.collectionNames(function (err, collections) {
    if (err) {
      return res.status(500).send(err);
    }

    var dbRegExp = new RegExp('^' + dbName + '\\.');

    collections = collections.reduce(function (collections, collection) {
      var name = collection.name.replace(dbRegExp, ''); // strip dbName
      if (name.indexOf('system.') < 0 && name.indexOf('_') !== 0) { // system and private collections
        collections.push(name);
      }
      return collections;
    }, []);

    res.status(200).send(collections);
  });
});

/**
 * GET /_collection/:resource
 */
app.get('/_collection/:resource', function (req, res) {
  req.collection.count(function (err, count) {
    if (err) {
      return res.status(500).send(err);
    }
    req.collection.find({}, function (err, cursor) {
      if (err) {
        return res.status(500).send(err);
      }
      var merged = {};

      cursor.stream()
        // Merge all objects in the collection into one:
        .pipe(through.obj(function (doc, enc, cb) {
          merged = _.merge({}, merged, doc);
          cb();
        }))
        .on('finish', function () {
          delete merged._id;

          res.status(200).send({
            name: req.resource,
            count: count,
            // Generate a document schema from the merged object:
            schema: schema.fromObject(merged)
          });
        });
    });
  });
});

/**
 * Possbile to add query parameters
 *
 * sort=example,-anotherExample
 * The minus here means it will be sorted descending.
 *
 * skip=10
 * limit=5
 *
 * GET /:resource
 */
app.get('/:resource', function (req, res) {
    req.collection.find(req.query, req.exp, function(err, cursor) {
      if (err) {
        return res.status(500).send(err);
      }
      cursor.stream()
        .pipe(JSONStream.stringify())
        .pipe(res);
    });
});

/**
 * GET /:resource/:id
 */
app.get('/:resource/:id', function (req, res) {
  req.collection.findOne({_id: req.id}, function(err, doc) {
    if (err) {
      return res.status(500).send(err);
    } else if (!doc) {
      return res.sendStatus(404);
    }
    res.status(200).send(doc);
  });
});

/**
 * GET /:mainResource/:id/:resource
 */
app.get('/:mainResource/:id/:resource', function (req, res) {
  var filter = req.query;
  filter[req.parentField] = req.id;
  req.collection.find(filter, req.exp, function(err, cursor) {
    if (err) {
      return res.status(500).send(err);
    }
    cursor.stream()
      .pipe(JSONStream.stringify())
      .pipe(res);
  });
});

/**
 * POST /:resource
 */
app.post('/:resource', function (req, res) {
  if (!req.body) {
    return res.status(400).send();
  }

  req.body.createdAt = new Date();
  req.body.updatedAt = req.body.createdAt;

  req.collection.insert(req.body, {w:1}, function(err, doc) {
    if (err) {
      return res.status(500).send(err);
    }
    res.status(200).send(doc && doc[0]);
  });
});

/**
 * POST /:mainResource/:id/:resource
 */
app.post('/:mainResource/:id/:resource', function (req, res) {
  if (!req.body) {
    return res.status(400).send();
  }
  req.body[req.parentField] = req.id;

  req.body.createdAt = new Date();
  req.body.updatedAt = req.body.createdAt;

  req.collection.insert(req.body, {w:1}, function(err, doc) {
    if (err) {
      return res.status(500).send(err);
    }
    res.status(200).send(doc && doc[0]);
  });
});

/**
 * PUT /:resource/:id
 */
app.put('/:resource/:id', function (req, res) {
  if (!req.body) {
    return res.status(400).send();
  }

  delete req.body._id;
  req.body.updatedAt = new Date();

  req.collection.update({_id: req.id}, req.body, {w:1}, function(err) {
    if (err) {
      return res.status(500).send(err);
    }
    res.sendStatus(204);
  });
});

/**
 * DELETE /:resource/:id
 */
app.delete('/:resource/:id', function (req, res) {
  req.collection.remove({_id: req.id}, {single: true, w:1}, function(err, nrOfRemoved) {
    if (err) {
      return res.status(500).send(err);
    } else if (nrOfRemoved === 0) {
      return res.sendStatus(404);
    }
    res.sendStatus(204);
  });
});

MongoClient.connect('mongodb://' + dbHost + '/' + dbName, function (err, database) {
  if (err) {
    throw err;
  }
  db = database;
  gridform.db = db;
  gridform.mongo = mongodb;
  gfs = gridform.gridfsStream(db, mongodb);

  app.listen(port, function () {
    var now = new Date().toString();
    console.log('[' + now + '] ' + pkg.name + ' server listening on ' + port + '...');
  });
});
