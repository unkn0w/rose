eval("//# sourceURL=assets/ember-cli/loader.js");

;eval("define(\"popup/app\", \n  [\"ember\",\"ember/resolver\",\"ember/load-initializers\",\"exports\"],\n  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {\n    \"use strict\";\n    var Ember = __dependency1__[\"default\"];\n    var Resolver = __dependency2__[\"default\"];\n    var loadInitializers = __dependency3__[\"default\"];\n\n    Ember.MODEL_FACTORY_INJECTIONS = true;\n\n    var App = Ember.Application.extend({\n      modulePrefix: \'popup\', // TODO: loaded via config\n      Resolver: Resolver\n    });\n\n    loadInitializers(App, \'popup\');\n\n    __exports__[\"default\"] = App;\n  });//# sourceURL=popup/app.js");

;eval("define(\"popup/controllers/backup\", \n  [\"ember\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    var Ember = __dependency1__[\"default\"];\n\n    __exports__[\"default\"] = Ember.Controller.extend({});\n  });//# sourceURL=popup/controllers/backup.js");

;eval("define(\"popup/controllers/diary\", \n  [\"ember\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    var Ember = __dependency1__[\"default\"];\n\n    __exports__[\"default\"] = Ember.Controller.extend({\n        newEntry: null,\n        failure: false,\n\n        diarySort: [\'createdAt:desc\'],\n        sortedDiary: Ember.computed.sort(\'diary\', \'diarySort\'),\n\n        diary: [\n            Ember.Object.create({\n                id: 0,\n                createdAt: new Date().toJSON(),\n                text: \"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Minima officia nesciunt necessitatibus nobis at veritatis blanditiis inventore architecto aliquid dolorem est velit, aliquam eaque minus, neque, possimus, in sunt modi.\",\n                hidden: false,\n                deleted: false\n            }),\n            Ember.Object.create({\n                id: 1,\n                createdAt: new Date().toJSON(),\n                text: \"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Minima officia nesciunt necessitatibus nobis at veritatis blanditiis inventore architecto aliquid dolorem est velit, aliquam eaque minus, neque, possimus, in sunt modi.\",\n                hidden: false,\n                deleted: false\n            }),\n            Ember.Object.create({\n                id: 2,\n                createdAt: new Date().toJSON(),\n                text: \"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Minima officia nesciunt necessitatibus nobis at veritatis blanditiis inventore architecto aliquid dolorem est velit, aliquam eaque minus, neque, possimus, in sunt modi.\",\n                hidden: false,\n                deleted: false\n            })\n        ],\n\n        actions: {\n            cancel: function() {\n                this.set(\'newEntry\', \'\');\n                this.set(\'failure\', false);\n            },\n            save: function() {\n                if(Ember.empty(this.get(\'newEntry\'))) {\n                    this.set(\'failure\', true);\n                    return;\n                }\n\n                this.set(\'failure\', false);\n\n                var values = {\n                    id: this.diary.length,\n                    createdAt: new Date().toJSON(),\n                    text: this.get(\'newEntry\')\n                };\n                var entry = Ember.Object.create(values);\n                this.diary.pushObject(entry);\n                this.set(\'newEntry\', \'\');\n            },\n            hide: function(entry) {\n                entry.set(\'hidden\', !entry.get(\'hidden\'));\n            },\n            \"delete\": function(entry) {\n                entry.set(\'deleted\', true);\n                entry.set(\'text\', \'\');\n            }\n        }\n    });\n  });//# sourceURL=popup/controllers/diary.js");

;eval("define(\"popup/helpers/datetime-formatter\", \n  [\"ember\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    var Ember = __dependency1__[\"default\"];\n\n    __exports__[\"default\"] = Ember.Handlebars.makeBoundHelper(function(value) {\n        return moment(value).calendar();\n    });\n  });//# sourceURL=popup/helpers/datetime-formatter.js");

;eval("define(\"popup/router\", \n  [\"ember\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    var Ember = __dependency1__[\"default\"];\n\n    var Router = Ember.Router.extend({\n        location: PopupENV.locationType\n    });\n\n    Router.map(function() {\n        this.route(\'about\');\n        this.route(\'backup\');\n        this.route(\'diary\');\n        this.route(\'documentation\');\n        this.route(\'settings\');\n        this.resource(\'facebook\', function() {\n            this.route(\'interactions\');\n            this.route(\'comments\');\n            this.route(\'privacy\');\n        });\n        this.resource(\'google\', function() {\n            this.route(\'interactions\');\n            this.route(\'comments\');\n            this.route(\'privacy\');\n        });\n    });\n\n    __exports__[\"default\"] = Router;\n  });//# sourceURL=popup/router.js");

;eval("define(\"popup/templates/application\", \n  [\"ember\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    var Ember = __dependency1__[\"default\"];\n    __exports__[\"default\"] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {\n    this.compilerInfo = [4,\'>= 1.0.0\'];\n    helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};\n      var buffer = \'\', stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;\n\n\n      data.buffer.push(\"<div class=\\\"ui grid\\\">\\n    <div class=\\\"ui four wide column\\\">\\n        \");\n      data.buffer.push(escapeExpression((helper = helpers.render || (depth0 && depth0.render),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:[\"STRING\"],data:data},helper ? helper.call(depth0, \"sidebar\", options) : helperMissing.call(depth0, \"render\", \"sidebar\", options))));\n      data.buffer.push(\"\\n    </div>\\n\\n    <div class=\\\"ui twelve wide column\\\">\\n        \");\n      stack1 = helpers._triageMustache.call(depth0, \"outlet\", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:[\"ID\"],data:data});\n      if(stack1 || stack1 === 0) { data.buffer.push(stack1); }\n      data.buffer.push(\"\\n    </div>\\n</div>\\n\");\n      return buffer;\n      \n    });\n  });//# sourceURL=popup/templates/application.js");

;eval("define(\"popup/templates/backup\", \n  [\"ember\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    var Ember = __dependency1__[\"default\"];\n    __exports__[\"default\"] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {\n    this.compilerInfo = [4,\'>= 1.0.0\'];\n    helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};\n      var buffer = \'\';\n\n\n      return buffer;\n      \n    });\n  });//# sourceURL=popup/templates/backup.js");

;eval("define(\"popup/templates/diary\", \n  [\"ember\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    var Ember = __dependency1__[\"default\"];\n    __exports__[\"default\"] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {\n    this.compilerInfo = [4,\'>= 1.0.0\'];\n    helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};\n      var buffer = \'\', stack1, helper, options, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;\n\n    function program1(depth0,data) {\n      \n      \n      data.buffer.push(\"\\n    <div class=\\\"ui warning message\\\">\\n        <div class=\\\"header\\\">Could you check something!</div>\\n        <ul class=\\\"list\\\">\\n            <li>You forgot to write <b>text</b></li>\\n        </ul>\\n    </div>\\n\");\n      }\n\n    function program3(depth0,data) {\n      \n      var buffer = \'\', stack1;\n      data.buffer.push(\"\\n        \");\n      stack1 = helpers.unless.call(depth0, \"entry.deleted\", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0],types:[\"ID\"],data:data});\n      if(stack1 || stack1 === 0) { data.buffer.push(stack1); }\n      data.buffer.push(\"\\n    \");\n      return buffer;\n      }\n    function program4(depth0,data) {\n      \n      var buffer = \'\', stack1, helper, options;\n      data.buffer.push(\"\\n            <div class=\\\"item\\\">\\n                <i class=\\\"avatar large circular text file outline icon\\\"></i>\\n                <div class=\\\"content\\\">\\n                    <div class=\\\"header\\\">\\n                        <span \");\n      data.buffer.push(escapeExpression(helpers[\'bind-attr\'].call(depth0, {hash:{\n        \'class\': (\"entry.hidden\")\n      },hashTypes:{\'class\': \"STRING\"},hashContexts:{\'class\': depth0},contexts:[],types:[],data:data})));\n      data.buffer.push(\">\\n                            \");\n      data.buffer.push(escapeExpression((helper = helpers[\'datetime-formatter\'] || (depth0 && depth0[\'datetime-formatter\']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:[\"ID\"],data:data},helper ? helper.call(depth0, \"entry.createdAt\", options) : helperMissing.call(depth0, \"datetime-formatter\", \"entry.createdAt\", options))));\n      data.buffer.push(\"\\n                        </span>\\n                        \");\n      stack1 = helpers[\'if\'].call(depth0, \"entry.hidden\", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(5, program5, data),contexts:[depth0],types:[\"ID\"],data:data});\n      if(stack1 || stack1 === 0) { data.buffer.push(stack1); }\n      data.buffer.push(\"\\n                    </div>\\n                    <p \");\n      data.buffer.push(escapeExpression(helpers[\'bind-attr\'].call(depth0, {hash:{\n        \'class\': (\"entry.hidden\")\n      },hashTypes:{\'class\': \"STRING\"},hashContexts:{\'class\': depth0},contexts:[],types:[],data:data})));\n      data.buffer.push(\">\\n                        \");\n      stack1 = helpers._triageMustache.call(depth0, \"entry.text\", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:[\"ID\"],data:data});\n      if(stack1 || stack1 === 0) { data.buffer.push(stack1); }\n      data.buffer.push(\"\\n                    </p>\\n                </div>\\n                <div class=\\\"actions\\\">\\n                    <a class=\\\"reply\\\" \");\n      data.buffer.push(escapeExpression(helpers.action.call(depth0, \"hide\", \"entry\", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:[\"STRING\",\"ID\"],data:data})));\n      data.buffer.push(\">Hide</a>\\n                    &middot;\\n                    <a class=\\\"delete\\\" \");\n      data.buffer.push(escapeExpression(helpers.action.call(depth0, \"delete\", \"entry\", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:[\"STRING\",\"ID\"],data:data})));\n      data.buffer.push(\">Delete</a>\\n                </div>\\n            </div>\\n        \");\n      return buffer;\n      }\n    function program5(depth0,data) {\n      \n      \n      data.buffer.push(\"\\n                            <i class=\\\"hide icon\\\"></i>\\n                        \");\n      }\n\n      data.buffer.push(\"<div class=\\\"ui fluid form\\\">\\n    <div class=\\\"field\\\">\\n        \");\n      data.buffer.push(escapeExpression((helper = helpers.textarea || (depth0 && depth0.textarea),options={hash:{\n        \'placeholder\': (\"Write a new diary entry...\"),\n        \'value\': (\"newEntry\"),\n        \'autofocus\': (true)\n      },hashTypes:{\'placeholder\': \"STRING\",\'value\': \"ID\",\'autofocus\': \"BOOLEAN\"},hashContexts:{\'placeholder\': depth0,\'value\': depth0,\'autofocus\': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, \"textarea\", options))));\n      data.buffer.push(\"\\n    </div>\\n    <div class=\\\"two fluid ui buttons\\\">\\n        <div class=\\\"ui button\\\" \");\n      data.buffer.push(escapeExpression(helpers.action.call(depth0, \"cancel\", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:[\"STRING\"],data:data})));\n      data.buffer.push(\">Cancel</div>\\n        <div class=\\\"ui positive button\\\" \");\n      data.buffer.push(escapeExpression(helpers.action.call(depth0, \"save\", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:[\"STRING\"],data:data})));\n      data.buffer.push(\">Save</div>\\n    </div>\\n</div>\\n\");\n      stack1 = helpers[\'if\'].call(depth0, \"failure\", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:[\"ID\"],data:data});\n      if(stack1 || stack1 === 0) { data.buffer.push(stack1); }\n      data.buffer.push(\"\\n<div class=\\\"ui celled list\\\">\\n    \");\n      stack1 = helpers.each.call(depth0, \"entry\", \"in\", \"sortedDiary\", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0,depth0,depth0],types:[\"ID\",\"ID\",\"ID\"],data:data});\n      if(stack1 || stack1 === 0) { data.buffer.push(stack1); }\n      data.buffer.push(\"\\n</div>\\n\");\n      return buffer;\n      \n    });\n  });//# sourceURL=popup/templates/diary.js");

;eval("define(\"popup/templates/sidebar\", \n  [\"ember\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    var Ember = __dependency1__[\"default\"];\n    __exports__[\"default\"] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {\n    this.compilerInfo = [4,\'>= 1.0.0\'];\n    helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};\n      var buffer = \'\', stack1, helper, options, self=this, helperMissing=helpers.helperMissing;\n\n    function program1(depth0,data) {\n      \n      \n      data.buffer.push(\"\\n        Diary\\n    \");\n      }\n\n    function program3(depth0,data) {\n      \n      \n      data.buffer.push(\"\\n        Backup\\n    \");\n      }\n\n      data.buffer.push(\"<div class=\\\"ui fluid vertical menu\\\">\\n    <div class=\\\"header item\\\">\\n        <i class=\\\"user icon\\\"></i>\\n        ROSE\\n    </div>\\n    \");\n      stack1 = (helper = helpers[\'link-to\'] || (depth0 && depth0[\'link-to\']),options={hash:{\n        \'classNames\': (\"item\")\n      },hashTypes:{\'classNames\': \"STRING\"},hashContexts:{\'classNames\': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:[\"STRING\"],data:data},helper ? helper.call(depth0, \"diary\", options) : helperMissing.call(depth0, \"link-to\", \"diary\", options));\n      if(stack1 || stack1 === 0) { data.buffer.push(stack1); }\n      data.buffer.push(\"\\n    \");\n      stack1 = (helper = helpers[\'link-to\'] || (depth0 && depth0[\'link-to\']),options={hash:{\n        \'classNames\': (\"item\")\n      },hashTypes:{\'classNames\': \"STRING\"},hashContexts:{\'classNames\': depth0},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0],types:[\"STRING\"],data:data},helper ? helper.call(depth0, \"backup\", options) : helperMissing.call(depth0, \"link-to\", \"backup\", options));\n      if(stack1 || stack1 === 0) { data.buffer.push(stack1); }\n      data.buffer.push(\"\\n    <a class=\\\"item\\\">\\n    Settings\\n    </a>\\n    <a class=\\\"item\\\">\\n        Updates\\n        <div class=\\\"ui label\\\">51</div>\\n    </a>\\n    <div class=\\\"header item\\\">\\n        <i class=\\\"user icon\\\"></i>\\n        Networks\\n    </div>\\n    <div class=\\\"item\\\">\\n        Facebook\\n        <div class=\\\"menu\\\">\\n            <a class=\\\"item\\\">\\n            Comments\\n            </a>\\n            <a class=\\\"item\\\">\\n            Interactions\\n            </a>\\n            <a class=\\\"item\\\">\\n            Privacy Settings\\n            </a>\\n        </div>\\n    </div>\\n    <div class=\\\"item\\\">\\n        Google+\\n        <div class=\\\"menu\\\">\\n            <a class=\\\"item\\\">\\n            Comments\\n            </a>\\n            <a class=\\\"item\\\">\\n            Interactions\\n            </a>\\n            <a class=\\\"item\\\">\\n            Privacy Settings\\n            </a>\\n        </div>\\n    </div>\\n    <div class=\\\"header item\\\">\\n        <i class=\\\"help icon\\\"></i>\\n        Help\\n    </div>\\n    <a class=\\\"item\\\">\\n    Documentation\\n    </a>\\n    <a class=\\\"item\\\">\\n    About\\n    </a>\\n</div>\\n\");\n      return buffer;\n      \n    });\n  });//# sourceURL=popup/templates/sidebar.js");

;eval("define(\"popup/tests/helpers/resolver\", \n  [\"ember/resolver\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    var Resolver = __dependency1__[\"default\"];\n\n    var resolver = Resolver.create();\n\n    resolver.namespace = {\n      modulePrefix: \'popup\'\n    };\n\n    __exports__[\"default\"] = resolver;\n  });//# sourceURL=popup/tests/helpers/resolver.js");

;eval("define(\"popup/tests/helpers/start-app\", \n  [\"ember\",\"exports\"],\n  function(__dependency1__, __exports__) {\n    \"use strict\";\n    /* global require */\n\n    var Application = require(\'popup/app\')[\'default\'];\n    var Router = require(\'popup/router\')[\'default\'];\n    var Ember = __dependency1__[\"default\"];\n\n    __exports__[\"default\"] = function startApp(attrs) {\n      var App;\n\n      var attributes = Ember.merge({\n        // useful Test defaults\n        rootElement: \'#ember-testing\',\n        LOG_ACTIVE_GENERATION:false,\n        LOG_VIEW_LOOKUPS: false\n      }, attrs); // but you can override;\n\n      Router.reopen({\n        location: \'none\'\n      });\n\n      Ember.run(function(){\n        App = Application.create(attributes);\n        App.setupForTesting();\n        App.injectTestHelpers();\n      });\n\n      App.reset(); // this shouldn\'t be needed, i want to be able to \"start an app at a specific URL\"\n\n      return App;\n    }\n  });//# sourceURL=popup/tests/helpers/start-app.js");

;eval("define(\"popup/tests/popup/app.jshint\", \n  [],\n  function() {\n    \"use strict\";\n    module(\'JSHint - popup\');\n    test(\'popup/app.js should pass jshint\', function() { \n      ok(true, \'popup/app.js should pass jshint.\'); \n    });\n  });//# sourceURL=popup/tests/popup/app.jshint.js");

;eval("define(\"popup/tests/popup/controllers/backup.jshint\", \n  [],\n  function() {\n    \"use strict\";\n    module(\'JSHint - popup/controllers\');\n    test(\'popup/controllers/backup.js should pass jshint\', function() { \n      ok(true, \'popup/controllers/backup.js should pass jshint.\'); \n    });\n  });//# sourceURL=popup/tests/popup/controllers/backup.jshint.js");

;eval("define(\"popup/tests/popup/controllers/diary.jshint\", \n  [],\n  function() {\n    \"use strict\";\n    module(\'JSHint - popup/controllers\');\n    test(\'popup/controllers/diary.js should pass jshint\', function() { \n      ok(true, \'popup/controllers/diary.js should pass jshint.\'); \n    });\n  });//# sourceURL=popup/tests/popup/controllers/diary.jshint.js");

;eval("define(\"popup/tests/popup/helpers/datetime-formatter.jshint\", \n  [],\n  function() {\n    \"use strict\";\n    module(\'JSHint - popup/helpers\');\n    test(\'popup/helpers/datetime-formatter.js should pass jshint\', function() { \n      ok(true, \'popup/helpers/datetime-formatter.js should pass jshint.\'); \n    });\n  });//# sourceURL=popup/tests/popup/helpers/datetime-formatter.jshint.js");

;eval("define(\"popup/tests/popup/router.jshint\", \n  [],\n  function() {\n    \"use strict\";\n    module(\'JSHint - popup\');\n    test(\'popup/router.js should pass jshint\', function() { \n      ok(true, \'popup/router.js should pass jshint.\'); \n    });\n  });//# sourceURL=popup/tests/popup/router.jshint.js");

;eval("define(\"popup/tests/popup/tests/helpers/resolver.jshint\", \n  [],\n  function() {\n    \"use strict\";\n    module(\'JSHint - popup/tests/helpers\');\n    test(\'popup/tests/helpers/resolver.js should pass jshint\', function() { \n      ok(true, \'popup/tests/helpers/resolver.js should pass jshint.\'); \n    });\n  });//# sourceURL=popup/tests/popup/tests/helpers/resolver.jshint.js");

;eval("define(\"popup/tests/popup/tests/helpers/start-app.jshint\", \n  [],\n  function() {\n    \"use strict\";\n    module(\'JSHint - popup/tests/helpers\');\n    test(\'popup/tests/helpers/start-app.js should pass jshint\', function() { \n      ok(true, \'popup/tests/helpers/start-app.js should pass jshint.\'); \n    });\n  });//# sourceURL=popup/tests/popup/tests/helpers/start-app.jshint.js");

;eval("define(\"popup/tests/popup/tests/test-helper.jshint\", \n  [],\n  function() {\n    \"use strict\";\n    module(\'JSHint - popup/tests\');\n    test(\'popup/tests/test-helper.js should pass jshint\', function() { \n      ok(true, \'popup/tests/test-helper.js should pass jshint.\'); \n    });\n  });//# sourceURL=popup/tests/popup/tests/test-helper.jshint.js");

;eval("define(\"popup/tests/test-helper\", \n  [\"popup/tests/helpers/resolver\",\"ember-qunit\"],\n  function(__dependency1__, __dependency2__) {\n    \"use strict\";\n    var resolver = __dependency1__[\"default\"];\n    var setResolver = __dependency2__.setResolver;\n\n    setResolver(resolver);\n\n    document.write(\'<div id=\"ember-testing-container\"><div id=\"ember-testing\"></div></div>\');\n  });//# sourceURL=popup/tests/test-helper.js");
