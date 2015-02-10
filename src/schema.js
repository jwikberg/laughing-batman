'use strict';
var str = require('underscore.string');
var ObjectId = require('mongodb').ObjectID;

exports.fromObject = objToSchema;

/**
 * Generate a simple JSON schema
 * from an object.
 *
 * @param {Object} obj
 * @returns {Object}
 */
function objToSchema (obj) {
  return Object.keys(obj).reduce(function (schema, key) {
    var type = getType(obj[key]);
    if (type === 'Array') {
      if (obj[key].length > 0) {
        type = getType(obj[key][0]);
        schema[key] = [type === 'Object' ? objToSchema(obj[key][0]) : type];
      } else {
        schema[key] = [];
      }
    } else if (type === 'Object') {
      schema[key] = objToSchema(obj[key]);
    } else {
      schema[key] = type;
    }
    return schema;
  }, {});
}

function getType (val) {
  if (val == null) {
    return null;
  }
  if (val instanceof ObjectID) {
    return 'ObjectID';
  }
  if (Array.isArray(val)) {
    return 'Array';
  }
  return str.classify(typeof val);
}
