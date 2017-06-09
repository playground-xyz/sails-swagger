const xfmr = require('../../../lib/xfmr');

const UI_MARKUP = `
<!DOCTYPE html>
<html>
  <head>
    <title>Playground XYZ API Docs</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">

  </head>
  <body>
    <redoc spec-url='{{SPEC_URL}}'></redoc>
    <script src="https://rebilly.github.io/ReDoc/releases/latest/redoc.min.js"> </script>
  </body>
</html>
`;

module.exports = function swaggerHook(sails) {

  return {
    defaults (overrides) {
      return {
        'swagger': {
          pkg: {
            name: 'No package information',
            description: 'You should set sails.config.swagger.pkg to retrieve the content of the package.json file',
            version: '0.0.0'
          }
        },
      };
    },

    initialize (next) {
      const doc = xfmr.getSwagger(sails, sails.config.swagger.pkg);
      sails.config.swaggerDoc = doc;
      next();
    },

    routes: {
      after: {
        'get /swagger/doc': function (req, res) {
          return res.status(200).send(sails.config.swaggerDoc);
        },
        'get /swagger/ui': function (req, res) {
          let docUrl = req.protocol + '://' + req.get('Host');
          if (sails.config.swagger.basePath) {
            docUrl = docUrl + sails.config.swagger.basePath;
          }
          docUrl = docUrl + '/swagger/doc'
          res.status(200).send(UI_MARKUP.replace('{{SPEC_URL}}', docUrl));
        }
      }
    }
  };
}

