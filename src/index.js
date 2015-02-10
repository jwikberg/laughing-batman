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
var schema = require('./schema');
var pkg = require('../package');
var MongoClient = mongodb.MongoClient;
var port = process.env.PORT || 3232;
var app = express();
var dbName = 'inhouse';
var db;

app.use(methodOverride());
app.use(morgan('combined'));
app.use(bodyParser.json());
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
 * GET /api/:resource
 */
app.get('/api/:resource', function (req, res) {
  req.collection.find(req.query, function(err, cursor) {
    if (err) {
      return res.status(500).send(err);
    }
    cursor.stream()
      .pipe(JSONStream.stringify())
      .pipe(res);
  });
});

/**
 * GET /api/:resource/:id
 */
app.get('/api/:resource/:id', function (req, res) {
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
 * GET /api/:mainResource/:id/:resource
 */
app.get('/api/:mainResource/:id/:resource', function (req, res) {
  var filter = req.query;
  filter[req.parentField] = req.id;
  req.collection.find(filter, function(err, cursor) {
    if (err) {
      return res.status(500).send(err);
    }
    cursor.stream()
      .pipe(JSONStream.stringify())
      .pipe(res);
  });
});

/**
 * POST /api/:resource/:id
 */
app.post('/api/:resource', function (req, res) {
  if (!req.body) {
    return res.status(400).send();
  }
  req.collection.insert(req.body, {w:1}, function(err, doc) {
    if (err) {
      return res.status(500).send(err);
    }
    res.status(200).send(doc && doc[0]);
  });
});

/**
 * POST /api/:mainResource/:id/:resource
 */
app.post('/api/:mainResource/:id/:resource', function (req, res) {
  if (!req.body) {
    return res.status(400).send();
  }
  req.body[req.parentField] = req.id;
  req.collection.insert(req.body, {w:1}, function(err, doc) {
    if (err) {
      return res.status(500).send(err);
    }
    res.status(200).send(doc && doc[0]);
  });
});

/**
 * PUT /api/:resource/:id
 */
app.put('/api/:resource/:id', function (req, res) {
  if (!req.body) {
    return res.status(400).send();
  }

  delete req.body._id;

  req.collection.update({_id: req.id}, req.body, {w:1}, function(err) {
    if (err) {
      return res.status(500).send(err);
    }
    res.sendStatus(204);
  });
});

/**
 * DELETE /api/:resource/:id
 */
app.delete('/api/:resource/:id', function (req, res) {
  req.collection.remove({_id: req.id}, {single: true, w:1}, function(err, nrOfRemoved) {
    if (err) {
      return res.status(500).send(err);
    } else if (nrOfRemoved === 0) {
      return res.sendStatus(404);
    }
    res.sendStatus(204);
  });
});

/**
 * GET /collection
 */
app.get('/collection', function (req, res) {
  db.collectionNames(function (err, collections) {
    if (err) {
      return res.status(500).send(err);
    }
    res.status(200).send(
      collections.filter(function (collection) {
        return collection.name.indexOf(dbName + '.') === 0 &&
               collection.name.indexOf('.system.') < 0;
      })
      .map(function (collection) {
        return collection.name.slice(8);
      })
    );
  });
});

/**
 * GET /collection/:resource
 */
app.get('/collection/:resource', function (req, res) {
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


MongoClient.connect('mongodb://localhost/' + dbName, function (err, database) {
  if (err) {
    throw err;
  }
  db = database;

  app.listen(port, function () {
    var now = new Date().toString();
    console.log('[' + now + '] ' + pkg.name + ' server listening on ' + port + '...');
  });
});