var config = require('config');
var bodyParser = require('body-parser');

module.exports = bodyParser({
  verify: verify
});

function verify(req, res, next) {
  if (req.headers['x-hub-signature'])
    throw new Error('Wrong endpoint for github webhook!');

  if (req.headers['x-github-event'])
    throw new Error('Wrong endpoint for github webhook!');

  if (req.headers['x-github-delivery'])
    throw new Error('Wrong endpoint for github webhook!');

  if(!req.headers['user-agent'] || !(req.headers['user-agent'].indexOf('Bitbucket-Webhooks') > -1))
    throw new Error('Not a valid bitbucket webhook!');
}
