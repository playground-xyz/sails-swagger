const _  = require('lodash');
const Spec = require('./spec');
const pluralize = require('pluralize');

const methodMap = {
    post: 'Create Object(s)',
    get: 'Read Object(s)',
    put: 'Update Object(s)',
    patch: 'Update Object(s)',
    delete: 'Destroy Object(s)',
    options: 'Get Resource Options',
    head: 'Get Resource headers'
}

function getBlueprintPrefixes() {
    // Add a "/" to a prefix if it's missing
    function formatPrefix(prefix) {
        return (prefix.indexOf('/') !== 0 ? '/' : '') + prefix
    }

    let prefixes = []
    return prefixes
}

const Transformer = {

    getSwagger(sails, pkg) {
        return _.merge(sails.config.swagger, {
            swagger: '2.0',
            info: Transformer.getInfo(sails, pkg),
            definitions: Transformer.getDefinitions(sails),
            paths: Transformer.getPaths(sails)
        });
    },

    /**
     * Convert a package.json file into a Swagger Info Object
     * http://swagger.io/specification/#infoObject
     */
    getInfo(sails, pkg) {
      const info = _.merge({
        title: pkg.name,
        version: pkg.version,
        contact: {
          name: pkg.author,
          email: pkg.email
        }
      }, sails.config.swagger.info);
      delete sails.config.swagger.pkg;
      return info;
    },

    /**
     * http://swagger.io/specification/#definitionsObject
     */
    getDefinitions(sails) {

      // JF: We're not using waterline so switch to use our maps file
      return sails.config.swagger.definitions;

        let definitions = _.transform(sails.models, (definitions, model, modelName) => {
            definitions[model.identity] = {
                properties: Transformer.getDefinitionProperties(model.definition)
            }
        })

        delete definitions['undefined']

        return definitions
    },

    getDefinitionProperties(definition) {

        return _.mapValues(definition, (def, attrName) => {
            let property = _.pick(def, [
                'type', 'description', 'format', 'model'
            ])

            return property.model && sails.config.blueprints.populate ? { '$ref': Transformer.generateDefinitionReference(property.model) } : Spec.getPropertyType(property.type)
        })
    },

    /**
     * Convert the internal Sails route map into a Swagger Paths
     * Object
     * http://swagger.io/specification/#pathsObject
     * http://swagger.io/specification/#pathItemObject
     */
    getPaths(sails) {
        return _.cloneDeep(Transformer.getDefinitionsFromRouteConfig(sails));

        // JF: This doesn't exist in sails 1.0.0
        let routes = sails.router._privateRouter.routes
        let pathGroups = _.chain(routes)
            .values()
            .flatten()
            .uniq(route => {
                return route.path + route.method + JSON.stringify(route.keys)
            })
            .reject({ path: '/*' })
            .reject({ path: '/__getcookie' })
            .reject({ path: '/csrfToken' })
            .reject({ path: '/csrftoken' })
            .groupBy('path')
            .value()

        pathGroups = _.reduce(pathGroups, function(result, routes, path) {
            path = path.replace(/:(\w+)\??/g, '{$1}')
            if (result[path])
                result[path] = _.union(result[path], routes)
            else
                result[path] = routes
            return result
        }, [])

        let inferredPaths = _.mapValues(pathGroups, pathGroup => {
            return Transformer.getPathItem(sails, pathGroup)
        }) || [];
        return Transformer.getDefinitionsFromRouteConfig(sails);
    },

    /**
     * Convert the swagger routes defined in sails.config.routes to route map
     * Object
     * http://swagger.io/specification/#pathsObject
     * http://swagger.io/specification/#pathItemObject
     */
    getDefinitionsFromRouteConfig(sails) {
        let routes = sails.config.routes,
            swaggerdefs = _.pickBy(routes, function(routeConfig, route) {
                return _.has(routeConfig, 'swagger');
            });

        let swaggerDefinitions = _.chain(routes)
            .pickBy(function(routeConfig, route) {
                return _.has(routeConfig, 'swagger');
            }).mapValues(function(route, key) {
                var swaggerdef = route.swagger || {};
                swaggerdef.responses = _.chain(swaggerdef.responses || {})
                    .mapValues(function(response, responseCode) {
                        if (response.schema || response.model) {
                            response.schema = response.schema || response.model;
                            if (typeof response.schema == 'string') {
                                response.schema = {
                                    '$ref': '#/definitions/' + (response.schema || '').toLowerCase()
                                };
                            }
                        }
                        if( (response.schema.type || '').toLowerCase()=='array' ){
                            response.schema.items = {
                                '$ref': '#/definitions/'+(response.schema.items.schema|| '').toLowerCase()
                            };
                        }
                        return response;
                    }).value();

                swaggerdef.parameters = _.chain(swaggerdef.parameters || [])
                    .map(function(parameter) {

                        if (typeof parameter.schema == 'string') {
                            parameter.schema = {
                                '$ref': '#/definitions/'+(parameter.schema || '').toLowerCase()
                            };
                        }
                        return parameter;
                    }).value();

                var methods = swaggerdef.methods || ['get'];
                delete swaggerdef.methods;
                var defs = {};
                _.map(methods, function(method) {
                    defs[(method || '').toLowerCase().trim()] = swaggerdef;
                });
                return defs;
            }).value();

        var swaggerPaths = {};
        for (var defRoute in swaggerDefinitions) {
            var sPath = (defRoute || '').toLowerCase().replace(/(get|post|put|option|delete)? ?/g, '');
            sPath = sPath.replace(/:(\w+)\??/g, '{$1}');
            swaggerPaths[sPath] = _.merge(  swaggerPaths[sPath] || {}, swaggerDefinitions[defRoute] );
        }

        return swaggerPaths || [];
    },

    getModelFromPath(sails, path) {
        let [$, parentModelName, parentId, childAttributeName, childId] = path.split('/')
        let parentModel = sails.models[parentModelName] || parentModelName ? sails.models[pluralize.singular(parentModelName)] : undefined
        let childAttribute = _.get(parentModel, ['attributes', childAttributeName])
        let childModelName = _.get(childAttribute, 'collection') || _.get(childAttribute, 'model')
        let childModel = sails.models[childModelName] || childModelName ? sails.models[pluralize.singular(childModelName)] : undefined

        return childModel || parentModel
    },

    getModelIdentityFromPath(sails, path) {
        let model = Transformer.getModelFromPath(sails, path)
        if (model) {
            return model.identity
        }
    },

    /**
     * http://swagger.io/specification/#definitionsObject
     */
    getDefinitionReferenceFromPath(sails, path) {
        let model = Transformer.getModelFromPath(sails, path)
        if (model) {
            return Transformer.generateDefinitionReference(model.identity)
        }
    },

    generateDefinitionReference(modelIdentity) {
        return '#/definitions/' + modelIdentity
    },

    /**
     * http://swagger.io/specification/#pathItemObject
     */
    getPathItem(sails, pathGroup) {
        let methodGroups = _.chain(pathGroup)
            .keyBy('method')
            .pick([
                'get', 'post', 'put', 'head', 'options', 'patch', 'delete'
            ])
            .value()

        return _.mapValues(methodGroups, (methodGroup, method) => {
            return Transformer.getOperation(sails, methodGroup, method)
        })
    },

    /**
     * http://swagger.io/specification/#operationObject
     */
    getOperation(sails, methodGroup, method) {
        return {
            summary: methodMap[method],
            consumes: ['application/json'],
            produces: ['application/json'],
            parameters: Transformer.getParameters(sails, methodGroup),
            responses: Transformer.getResponses(sails, methodGroup),
            tags: Transformer.getPathTags(sails, methodGroup)
        }
    },

    /**
     * A list of tags for API documentation control. Tags can be used for logical
     * grouping of operations by resources or any other qualifier.
     */
    getPathTags(sails, methodGroup) {
        return _.uniq(_.compact([
            Transformer.getPathModelTag(sails, methodGroup),
            Transformer.getPathControllerTag(sails, methodGroup),
            Transformer.getControllerFromRoute(sails, methodGroup)
        ]))
    },

    getPathModelTag(sails, methodGroup) {
        let model = Transformer.getModelFromPath(sails, methodGroup.path)
        return model && model.globalId
    },

    getPathControllerTag(sails, methodGroup) {
        // Fist check if we can find a controller tag using prefixed blueprint routes
        for (var prefix of getBlueprintPrefixes()) {
            if (methodGroup.path.indexOf(prefix) === 0) {
                let [$, pathToken] = methodGroup.path.replace(prefix, '').split('/')
                let tag = _.get(sails.controllers, [pathToken, 'globalId'])
                if (tag) return tag
            }
        }

        let [$, pathToken] = methodGroup.path.split('/')
        return _.get(sails.controllers, [pathToken, 'globalId'])
    },

    getControllerFromRoute(sails, methodGroup) {
        let route = sails.config.routes[`${methodGroup.method} ${methodGroup.path}`]
        if (!route) return

        let pattern = /(.+)Controller/
        let controller = route.controller || (_.isString(route) && route.split('.')[0])

        if (!controller) return

        let [$, name] = /(.+)Controller/.exec(controller)

        return name
    },

    /**
     * http://swagger.io/specification/#parameterObject
     */
    getParameters(sails, methodGroup) {
        let method = methodGroup.method
        let routeKeys = methodGroup.keys

        let canHavePayload = method === 'post' || method === 'put'

        if (!routeKeys.length && !canHavePayload) return []

        let parameters = _.map(routeKeys, param => {
            return {
                name: param.name,
                in : 'path',
                required: true,
                type: 'string'
            }
        })

        if (canHavePayload) {
            let path = methodGroup.path
            let modelIdentity = Transformer.getModelIdentityFromPath(sails, path)

            if (modelIdentity) {
                parameters.push({
                    name: modelIdentity,
                    in : 'body',
                    required: true,
                    schema: {
                        $ref: Transformer.getDefinitionReferenceFromPath(sails, path)
                    }
                })
            }
        }

        return parameters
    },

    /**
     * http://swagger.io/specification/#responsesObject
     */
    getResponses(sails, methodGroup) {
        let $ref = Transformer.getDefinitionReferenceFromPath(sails, methodGroup.path)
        let ok = {
            description: 'The requested resource'
        }
        if ($ref) {
            ok.schema = { '$ref': $ref }
        }
        return {
            '200': ok,
            '404': { description: 'Resource not found' },
            '500': { description: 'Internal server error' }
        }
    }
}

module.exports = Transformer;

