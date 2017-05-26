const xfmr = require('../../../lib/xfmr');

module.exports = function swaggerHook(sails) {

  return {
    defaults (overrides) {
      return {
        'swagger': {
          pkg: {
            name: 'No package information',
            description: 'You should set sails.config.swagger.pkg to retrieve the content of the package.json file',
            version: '0.0.0'
          },
          ui: {
            url: 'http://localhost:8080/'
          }
        },
      };
    },

    initialize (next) {
      const doc = xfmr.getSwagger(sails, sails.config.swagger.pkg);

      sails.config.swagger.doc = doc;

      next();
    },

    routes: {
      after: {
        'get /swagger/doc': function (req, res) {
          return res.status(200).send(sails.config.swagger.doc);
        },
        'get /swagger/ui': function (req, res) {
          let docUrl = req.protocol + '://' + req.get('Host') + '/swagger/doc'
          res.redirect(sails.config.swagger.ui.url + '?url=' + encodeURIComponent(docUrl))
        }
      }
    }
  };
}

