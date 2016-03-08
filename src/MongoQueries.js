'use strict';

/**
 *  Help class to pull the query parameters and convert Sort, Limit and Skip to proper
 *  Mongo expression.
 *
*/

module.exports = {

  queryToMongoExpressions :function (req) {

    var sort = createSortJSON(req);
    var skip = req.query.skip;
    var limit = req.query.limit;

    delete req.query.limit;
    delete req.query.skip;

    return {'limit': limit, 'skip': skip, 'sort': sort};

 }

}

var createSortJSON = function(req) {

  var sort = req.query.sort;

  if (sort === undefined) {
    return sort;
  }

  var sortFieldsArr = sort.split(',');
  var sortJSONArr= [];
  for (var i = 0; i < sortFieldsArr.length; i++) {
   sortJSONArr.push([]);
   var currentField = sortFieldsArr[i];
   sortJSONArr[i].push(currentField);
   if (isDesc(currentField)) {

      sortJSONArr[i][0] = currentField.substring(1);  // If the user used "-" before the field it should be sorted desc
      sortJSONArr[i].push('desc');                           // and we need to remove the "-".
    } else {

      sortJSONArr[i].push('asc');
    }
  }

  delete req.query.sort;    // We need to remove it from the query.

  return sortJSONArr;
}


var isDesc = function(field) {
  return field.indexOf('-') === 0;
}
