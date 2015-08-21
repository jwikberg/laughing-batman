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
var githubWebhookMiddleware = require('github-webhook-middleware')({
  secret: 'process.env.GITHUB_SECRET'
});
var schema = require('./schema');
var pkg = require('../package');
var mongoQueries = require('./MongoQueries');
var MongoClient = mongodb.MongoClient;
var port = process.env.PORT || 3233;
var app = express();
var dbHost = process.env.MONGO_HOST || 'localhost';
var dbName = 'inhouse';
var db;
var fs   = require('fs-extra');

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
 * GitHub Webhook endpoint
 *
 * Adds incoming repo to build queue
 *
 * POST /_hook/:endpoint
 */
app.post('/_hook/:endpoint?', githubWebhookMiddleware, function (req, res) {
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

var formidable = require('formidable'),
    http = require('http'),
    util = require('util');

/**
 * POST /:resource
 */
app.post('/:resource', function (req, res) {
  var form = new formidable.IncomingForm();
  form.parse(req, function(err, fields, files) {
    res.write('received upload:\n\n');
    util.inspect({fields: fields, files: files});
  });

  form.on('file', function(name, file) {
    console.log('kangaroo', file);
  //  console.log(this.openedFiles[0].path, this.openedFiles[0].path);
    fs.readFile(this.openedFiles[0].path, function(err, imageData) {
      if (err) {
        res.end("Error reading your file on the server!");
      }else{
        //when saving an object with an image's byte array
        var imageBson = {};
        imageBson.image = new req.db.bson_serializer.Binary(imageData);
        imageBson.imageType = file.type;
        req.collection = req.db.collection(req.resource);
        req.collection.insert(imageBson, {safe: true},function(err, bsonData) {
          if (err) {
            res.end({ msg:'Error saving your file to the database!' });
          } else {
            console.log('det gick bra');
          }
        });
      }
    });
  });
  return res.sendStatus(200);
});

app.get('/:resource/:id', function (req, res) {
  console.log('IIIIDDDD', req.params.id);
    req.collection.find(req.query, req.exp, function(err, cursor) {
      if (err) {
        return res.status(500).send(err);
      }

      var items;
      var first = true;

        cursor.each(function(err, item) {
         items = item;
         if (first) {
          items =  new req.db.bson_deserializer.Binary(item);
          res.set('Content-Type', 'image/jpeg');
          res.send(item.image.buffer);
          first = false;
         }
      });

     /* if (req.params.id === '123456456125') {
        cursor.each(function(err, item) {
         items = item;
         if (first && item && item._id.equals('55cdacc1f425f1c35fddaf64')) {
          console.log('LLLL');
          items =  new req.db.bson_deserializer.Binary(item);
          res.set('Content-Type', 'image/jpeg');
          res.send(item.image.buffer);
          first = false;
         }
      });
      } else {
        cursor.each(function(err, item) {
         items = item;
         if (first) {
          console.log('LLLL');
          items =  new req.db.bson_deserializer.Binary(item);
          res.set('Content-Type', 'image/jpeg');
          res.send(item.image.buffer);
          first = false;
         }
      });
      } */
    });
});


app.use(bodyParser.json());

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

  app.listen(port, function () {
    var now = new Date().toString();
    console.log('[' + now + '] ' + pkg.name + ' server listening on ' + port + '...');
  });
});
