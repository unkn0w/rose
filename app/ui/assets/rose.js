"use strict";
/* jshint ignore:start */

/* jshint ignore:end */

define('rose/adapters/application', ['exports', 'ember', 'ember-localforage-adapter/adapters/localforage'], function (exports, _ember, _emberLocalforageAdapterAdaptersLocalforage) {
  exports['default'] = _emberLocalforageAdapterAdaptersLocalforage['default'].extend({
    loadData: function loadData() {
      var adapter = this;
      return new _ember['default'].RSVP.Promise(function (resolve, reject) {
        kango.invokeAsyncCallback('localforage.getItem', adapter.adapterNamespace(), function (storage) {
          var resolved = storage ? storage : {};
          resolve(resolved);
        });
      });
    },

    persistData: function persistData(type, data) {
      var adapter = this;
      var modelNamespace = this.modelNamespace(type);
      return new _ember['default'].RSVP.Promise(function (resolve, reject) {
        if (adapter.caching !== 'none') {
          adapter.cache.set(modelNamespace, data);
        }
        adapter.loadData().then(function (localStorageData) {
          localStorageData[modelNamespace] = data;
          var toBePersisted = localStorageData;

          kango.invokeAsyncCallback('localforage.setItem', adapter.adapterNamespace(), toBePersisted, function () {
            resolve();
          });
        });
      });
    },

    _namespaceForType: function _namespaceForType(type) {
      var namespace = this.modelNamespace(type);
      var adapter = this;
      var cache;
      var promise;

      if (adapter.caching !== 'none') {
        cache = adapter.cache.get(namespace);
      } else {
        cache = null;
      }
      if (cache) {
        promise = new _ember['default'].RSVP.resolve(cache);
      } else {
        promise = new _ember['default'].RSVP.Promise(function (resolve, reject) {
          kango.invokeAsyncCallback('localforage.getItem', adapter.adapterNamespace(), function (storage) {
            var ns = storage ? storage[namespace] || { records: {} } : { records: {} };
            if (adapter.caching === 'model') {
              adapter.cache.set(namespace, ns);
            } else if (adapter.caching === 'all') {
              if (storage) {
                adapter.cache.replace(storage);
              }
            }
            resolve(ns);
          });
        });
      }
      return promise;
    }
  });
});
define('rose/adapters/comment', ['exports', 'rose/adapters/kango-adapter'], function (exports, _roseAdaptersKangoAdapter) {
  exports['default'] = _roseAdaptersKangoAdapter['default'].extend({
    collectionNamespace: 'Comments',
    modelNamespace: 'Comment'
  });
});
define('rose/adapters/extract', ['exports', 'rose/adapters/kango-adapter'], function (exports, _roseAdaptersKangoAdapter) {
  exports['default'] = _roseAdaptersKangoAdapter['default'].extend({
    collectionNamespace: 'Extracts',
    modelNamespace: 'Extract'
  });
});
define('rose/adapters/extractor', ['exports', 'rose/adapters/kango-adapter'], function (exports, _roseAdaptersKangoAdapter) {
  exports['default'] = _roseAdaptersKangoAdapter['default'].extend({
    collectionNamespace: 'Extractors',
    modelNamespace: 'Extractor'
  });
});
define('rose/adapters/interaction', ['exports', 'rose/adapters/kango-adapter'], function (exports, _roseAdaptersKangoAdapter) {
  exports['default'] = _roseAdaptersKangoAdapter['default'].extend({
    collectionNamespace: 'Interactions',
    modelNamespace: 'Interaction'
  });
});
define('rose/adapters/kango-adapter', ['exports', 'ember', 'ember-data', 'rose/adapters/utils/queue'], function (exports, _ember, _emberData, _roseAdaptersUtilsQueue) {
  exports['default'] = _emberData['default'].Adapter.extend({
    queue: _roseAdaptersUtilsQueue['default'].create(),

    createRecord: function createRecord(store, type, snapshot) {
      var collectionNamespace = this.collectionNamespace;
      var modelNamespace = this.modelNamespace;
      var id = snapshot.id;
      var serializer = store.serializerFor(snapshot.modelName);
      var recordHash = serializer.serialize(snapshot, { includeId: true });

      return this.queue.attach(function (resolve) {
        kango.invokeAsyncCallback('localforage.getItem', collectionNamespace, function (list) {
          if (_ember['default'].isEmpty(list)) {
            list = [];
          }

          if (!list.contains(modelNamespace + '/' + id)) {
            list.push(modelNamespace + '/' + id);
          }

          kango.invokeAsyncCallback('localforage.setItem', collectionNamespace, list, function () {
            kango.invokeAsyncCallback('localforage.setItem', modelNamespace + '/' + id, recordHash, function () {
              resolve(recordHash);
            });
          });
        });
      });
    },

    findAll: function findAll() {
      return getList(this.collectionNamespace).then(function (comments) {
        if (_ember['default'].isEmpty(comments)) {
          return [];
        }

        var promises = [];

        comments.forEach(function (id) {
          promises.push(getItem(id));
        });

        return _ember['default'].RSVP.all(promises).then(function (comments) {
          return comments.map(function (comment) {
            comment.rating = [].concat(comment.rating);
            return comment;
          });
        });
      });
    },

    find: function find(store, type, id, snapshot) {
      var adapter = this;

      return getItem(adapter.modelNamespace + '/' + id);
    },

    findQuery: function findQuery(store, type, query, recordArray) {
      return getList(this.collectionNamespace).then(function (comments) {
        if (_ember['default'].isEmpty(comments)) {
          return [];
        }

        var promises = [];

        comments.forEach(function (id) {
          promises.push(getItem(id));
        });

        return _ember['default'].RSVP.all(promises).then(function (comments) {
          return comments.filter(function (comment) {
            var result = false;

            Object.keys(query).forEach(function (key) {
              result = comment[key] == query[key];
            });

            return result;
          });
        });
      });
    },

    deleteRecord: function deleteRecord(store, type, snapshot) {
      var id = snapshot.id;
      return this.removeItem(id);
    },

    updateRecord: function updateRecord(store, type, snapshot) {
      var id = snapshot.id;
      var modelNamespace = this.modelNamespace;
      var recordHash = snapshot.serialize({ includeId: true });

      return this.queue.attach(function (resolve, reject) {
        kango.invokeAsyncCallback('localforage.setItem', modelNamespace + '/' + id, recordHash, function () {
          resolve();
        });
      });
    },

    removeItem: function removeItem(id) {
      var collectionNamespace = this.collectionNamespace;
      var modelNamespace = this.modelNamespace;

      return this.queue.attach(function (resolve, reject) {
        kango.invokeAsyncCallback('localforage.getItem', collectionNamespace, function (collection) {
          if (!_ember['default'].isEmpty(collection)) {
            var index = collection.indexOf(modelNamespace + '/' + id);

            if (index > -1) {
              collection.splice(index, 1);

              kango.invokeAsyncCallback('localforage.setItem', collectionNamespace, collection, function () {
                kango.invokeAsyncCallback('localforage.removeItem', modelNamespace + '/' + id, function () {
                  resolve();
                });
              });
            }
          }
        });
      });
    }
  });

  function getList(namespace) {
    return new _ember['default'].RSVP.Promise(function (resolve, reject) {
      kango.invokeAsyncCallback('localforage.getItem', namespace, function (list) {
        resolve(list);
      });
    });
  }

  function getItem(id) {
    return new _ember['default'].RSVP.Promise(function (resolve, reject) {
      kango.invokeAsyncCallback('localforage.getItem', id, function (item) {
        resolve(item);
      });
    });
  }
});
define('rose/adapters/network', ['exports', 'rose/adapters/kango-adapter'], function (exports, _roseAdaptersKangoAdapter) {
  exports['default'] = _roseAdaptersKangoAdapter['default'].extend({
    collectionNamespace: 'Networks',
    modelNamespace: 'Network'
  });
});
define('rose/adapters/observer', ['exports', 'rose/adapters/kango-adapter'], function (exports, _roseAdaptersKangoAdapter) {
  exports['default'] = _roseAdaptersKangoAdapter['default'].extend({
    collectionNamespace: 'Observers',
    modelNamespace: 'Observer'
  });
});
define('rose/adapters/system-config', ['exports', 'rose/adapters/kango-adapter'], function (exports, _roseAdaptersKangoAdapter) {
  exports['default'] = _roseAdaptersKangoAdapter['default'].extend({
    collectionNamespace: 'systemConfigs',
    modelNamespace: 'systemConfig'
  });
});
define('rose/adapters/user-setting', ['exports', 'rose/adapters/kango-adapter'], function (exports, _roseAdaptersKangoAdapter) {
  exports['default'] = _roseAdaptersKangoAdapter['default'].extend({
    collectionNamespace: 'userSettings',
    modelNamespace: 'userSetting'
  });
});
define('rose/adapters/utils/queue', ['exports', 'ember'], function (exports, _ember) {
  var Promise = _ember['default'].RSVP.Promise;
  exports['default'] = _ember['default'].Object.extend({
    queue: [Promise.resolve()],

    attach: function attach(callback) {
      var _this = this;

      var queueKey = this.queue.length;

      this.queue[queueKey] = new _ember['default'].RSVP.Promise(function (resolve, reject) {
        _this.queue[queueKey - 1].then(function () {
          _this.queue.splice(queueKey, 1);
          callback(resolve, reject);
        });
      });

      return this.queue[queueKey];
    }
  });
});
define('rose/app', ['exports', 'ember', 'ember/resolver', 'ember/load-initializers', 'rose/config/environment'], function (exports, _ember, _emberResolver, _emberLoadInitializers, _roseConfigEnvironment) {

  var App = undefined;

  _ember['default'].MODEL_FACTORY_INJECTIONS = true;

  App = _ember['default'].Application.extend({
    modulePrefix: _roseConfigEnvironment['default'].modulePrefix,
    podModulePrefix: _roseConfigEnvironment['default'].podModulePrefix,
    Resolver: _emberResolver['default']
  });

  (0, _emberLoadInitializers['default'])(App, _roseConfigEnvironment['default'].modulePrefix);

  exports['default'] = App;
});
define('rose/components/app-version', ['exports', 'ember-cli-app-version/components/app-version', 'rose/config/environment'], function (exports, _emberCliAppVersionComponentsAppVersion, _roseConfigEnvironment) {

  var name = _roseConfigEnvironment['default'].APP.name;
  var version = _roseConfigEnvironment['default'].APP.version;

  exports['default'] = _emberCliAppVersionComponentsAppVersion['default'].extend({
    version: version,
    name: name
  });
});
define('rose/components/high-charts', ['exports', 'ember-highcharts/components/high-charts'], function (exports, _emberHighchartsComponentsHighCharts) {
  exports['default'] = _emberHighchartsComponentsHighCharts['default'];
});
define("rose/components/lf-outlet", ["exports", "liquid-fire/ember-internals"], function (exports, _liquidFireEmberInternals) {
  exports["default"] = _liquidFireEmberInternals.StaticOutlet;
});
define('rose/components/lf-overlay', ['exports', 'ember'], function (exports, _ember) {
  var COUNTER = '__lf-modal-open-counter';

  exports['default'] = _ember['default'].Component.extend({
    tagName: 'span',
    classNames: ['lf-overlay'],

    didInsertElement: function didInsertElement() {
      var body = _ember['default'].$('body');
      var counter = body.data(COUNTER) || 0;
      body.addClass('lf-modal-open');
      body.data(COUNTER, counter + 1);
    },

    willDestroy: function willDestroy() {
      var body = _ember['default'].$('body');
      var counter = body.data(COUNTER) || 0;
      body.data(COUNTER, counter - 1);
      if (counter < 2) {
        body.removeClass('lf-modal-open');
      }
    }
  });
});
define('rose/components/liquid-bind', ['exports', 'ember'], function (exports, _ember) {

  var LiquidBind = _ember['default'].Component.extend({
    tagName: '',
    positionalParams: ['value'] // needed for Ember 1.13.[0-5] and 2.0.0-beta.[1-3] support
  });

  LiquidBind.reopenClass({
    positionalParams: ['value']
  });

  exports['default'] = LiquidBind;
});
define('rose/components/liquid-child', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Component.extend({
    classNames: ['liquid-child'],

    didInsertElement: function didInsertElement() {
      var $container = this.$();
      if ($container) {
        $container.css('visibility', 'hidden');
      }
      this.sendAction('liquidChildDidRender', this);
    }

  });
});
define("rose/components/liquid-container", ["exports", "ember", "liquid-fire/growable", "rose/components/liquid-measured"], function (exports, _ember, _liquidFireGrowable, _roseComponentsLiquidMeasured) {
  exports["default"] = _ember["default"].Component.extend(_liquidFireGrowable["default"], {
    classNames: ['liquid-container'],

    lockSize: function lockSize(elt, want) {
      elt.outerWidth(want.width);
      elt.outerHeight(want.height);
    },

    unlockSize: function unlockSize() {
      var _this = this;

      var doUnlock = function doUnlock() {
        _this.updateAnimatingClass(false);
        var elt = _this.$();
        if (elt) {
          elt.css({ width: '', height: '' });
        }
      };
      if (this._scaling) {
        this._scaling.then(doUnlock);
      } else {
        doUnlock();
      }
    },

    // We're doing this manually instead of via classNameBindings
    // because it depends on upward-data-flow, which generates warnings
    // under Glimmer.
    updateAnimatingClass: function updateAnimatingClass(on) {
      if (this.isDestroyed || !this._wasInserted) {
        return;
      }
      if (arguments.length === 0) {
        on = this.get('liquidAnimating');
      } else {
        this.set('liquidAnimating', on);
      }
      if (on) {
        this.$().addClass('liquid-animating');
      } else {
        this.$().removeClass('liquid-animating');
      }
    },

    startMonitoringSize: _ember["default"].on('didInsertElement', function () {
      this._wasInserted = true;
      this.updateAnimatingClass();
    }),

    actions: {

      willTransition: function willTransition(versions) {
        if (!this._wasInserted) {
          return;
        }

        // Remember our own size before anything changes
        var elt = this.$();
        this._cachedSize = (0, _roseComponentsLiquidMeasured.measure)(elt);

        // And make any children absolutely positioned with fixed sizes.
        for (var i = 0; i < versions.length; i++) {
          goAbsolute(versions[i]);
        }

        // Apply '.liquid-animating' to liquid-container allowing
        // any customizable CSS control while an animating is occuring
        this.updateAnimatingClass(true);
      },

      afterChildInsertion: function afterChildInsertion(versions) {
        var elt = this.$();
        var enableGrowth = this.get('enableGrowth') !== false;

        // Measure  children
        var sizes = [];
        for (var i = 0; i < versions.length; i++) {
          if (versions[i].view) {
            sizes[i] = (0, _roseComponentsLiquidMeasured.measure)(versions[i].view.$());
          }
        }

        // Measure ourself again to see how big the new children make
        // us.
        var want = (0, _roseComponentsLiquidMeasured.measure)(elt);
        var have = this._cachedSize || want;

        // Make ourself absolute
        if (enableGrowth) {
          this.lockSize(elt, have);
        } else {
          this.lockSize(elt, {
            height: Math.max(want.height, have.height),
            width: Math.max(want.width, have.width)
          });
        }

        // Make the children absolute and fixed size.
        for (i = 0; i < versions.length; i++) {
          goAbsolute(versions[i], sizes[i]);
        }

        // Kick off our growth animation
        if (enableGrowth) {
          this._scaling = this.animateGrowth(elt, have, want);
        }
      },

      afterTransition: function afterTransition(versions) {
        for (var i = 0; i < versions.length; i++) {
          goStatic(versions[i]);
        }
        this.unlockSize();
      }
    }
  });

  function goAbsolute(version, size) {
    if (!version.view) {
      return;
    }
    var elt = version.view.$();
    var pos = elt.position();
    if (!size) {
      size = (0, _roseComponentsLiquidMeasured.measure)(elt);
    }
    elt.outerWidth(size.width);
    elt.outerHeight(size.height);
    elt.css({
      position: 'absolute',
      top: pos.top,
      left: pos.left
    });
  }

  function goStatic(version) {
    if (version.view && !version.view.isDestroyed) {
      version.view.$().css({ width: '', height: '', position: '' });
    }
  }
});
define('rose/components/liquid-if', ['exports', 'ember', 'liquid-fire/ember-internals'], function (exports, _ember, _liquidFireEmberInternals) {

  var LiquidIf = _ember['default'].Component.extend({
    positionalParams: ['predicate'], // needed for Ember 1.13.[0-5] and 2.0.0-beta.[1-3] support
    tagName: '',
    helperName: 'liquid-if',
    didReceiveAttrs: function didReceiveAttrs() {
      this._super();
      var predicate = (0, _liquidFireEmberInternals.shouldDisplay)(this.getAttr('predicate'));
      this.set('showFirstBlock', this.inverted ? !predicate : predicate);
    }
  });

  LiquidIf.reopenClass({
    positionalParams: ['predicate']
  });

  exports['default'] = LiquidIf;
});
define("rose/components/liquid-measured", ["exports", "liquid-fire/components/liquid-measured"], function (exports, _liquidFireComponentsLiquidMeasured) {
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function get() {
      return _liquidFireComponentsLiquidMeasured["default"];
    }
  });
  Object.defineProperty(exports, "measure", {
    enumerable: true,
    get: function get() {
      return _liquidFireComponentsLiquidMeasured.measure;
    }
  });
});
define('rose/components/liquid-modal', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Component.extend({
    classNames: ['liquid-modal'],
    currentContext: _ember['default'].computed('owner.modalContexts.lastObject', function () {
      var context = this.get('owner.modalContexts.lastObject');
      if (context) {
        context.view = this.innerView(context);
      }
      return context;
    }),

    owner: _ember['default'].inject.service('liquid-fire-modals'),

    innerView: function innerView(current) {
      var self = this,
          name = current.get('name'),
          container = this.get('container'),
          component = container.lookup('component-lookup:main').lookupFactory(name);
      _ember['default'].assert("Tried to render a modal using component '" + name + "', but couldn't find it.", !!component);

      var args = _ember['default'].copy(current.get('params'));

      args.registerMyself = _ember['default'].on('init', function () {
        self.set('innerViewInstance', this);
      });

      // set source so we can bind other params to it
      args._source = _ember['default'].computed(function () {
        return current.get("source");
      });

      var otherParams = current.get("options.otherParams");
      var from, to;
      for (from in otherParams) {
        to = otherParams[from];
        args[to] = _ember['default'].computed.alias("_source." + from);
      }

      var actions = current.get("options.actions") || {};

      // Override sendAction in the modal component so we can intercept and
      // dynamically dispatch to the controller as expected
      args.sendAction = function (name) {
        var actionName = actions[name];
        if (!actionName) {
          this._super.apply(this, Array.prototype.slice.call(arguments));
          return;
        }

        var controller = current.get("source");
        var args = Array.prototype.slice.call(arguments, 1);
        args.unshift(actionName);
        controller.send.apply(controller, args);
      };

      return component.extend(args);
    },

    actions: {
      outsideClick: function outsideClick() {
        if (this.get('currentContext.options.dismissWithOutsideClick')) {
          this.send('dismiss');
        } else {
          proxyToInnerInstance(this, 'outsideClick');
        }
      },
      escape: function escape() {
        if (this.get('currentContext.options.dismissWithEscape')) {
          this.send('dismiss');
        } else {
          proxyToInnerInstance(this, 'escape');
        }
      },
      dismiss: function dismiss() {
        var source = this.get('currentContext.source'),
            proto = source.constructor.proto(),
            params = this.get('currentContext.options.withParams'),
            clearThem = {};

        for (var key in params) {
          if (proto[key] instanceof _ember['default'].ComputedProperty) {
            clearThem[key] = undefined;
          } else {
            clearThem[key] = proto[key];
          }
        }
        source.setProperties(clearThem);
      }
    }
  });

  function proxyToInnerInstance(self, message) {
    var vi = self.get('innerViewInstance');
    if (vi) {
      vi.send(message);
    }
  }
});
define('rose/components/liquid-outlet', ['exports', 'ember'], function (exports, _ember) {

  var LiquidOutlet = _ember['default'].Component.extend({
    positionalParams: ['inputOutletName'], // needed for Ember 1.13.[0-5] and 2.0.0-beta.[1-3] support
    tagName: '',
    didReceiveAttrs: function didReceiveAttrs() {
      this._super();
      this.set('outletName', this.attrs.inputOutletName || 'main');
    }
  });

  LiquidOutlet.reopenClass({
    positionalParams: ['inputOutletName']
  });

  exports['default'] = LiquidOutlet;
});
define("rose/components/liquid-spacer", ["exports", "liquid-fire/components/liquid-spacer"], function (exports, _liquidFireComponentsLiquidSpacer) {
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function get() {
      return _liquidFireComponentsLiquidSpacer["default"];
    }
  });
});
define('rose/components/liquid-unless', ['exports', 'rose/components/liquid-if'], function (exports, _roseComponentsLiquidIf) {
  exports['default'] = _roseComponentsLiquidIf['default'].extend({
    helperName: 'liquid-unless',
    layoutName: 'components/liquid-if',
    inverted: true
  });
});
define("rose/components/liquid-versions", ["exports", "ember", "liquid-fire/ember-internals"], function (exports, _ember, _liquidFireEmberInternals) {

  var get = _ember["default"].get;
  var set = _ember["default"].set;

  exports["default"] = _ember["default"].Component.extend({
    tagName: "",
    name: 'liquid-versions',

    transitionMap: _ember["default"].inject.service('liquid-fire-transitions'),

    didReceiveAttrs: function didReceiveAttrs() {
      this._super();
      if (!this.versions || this._lastVersion !== this.getAttr('value')) {
        this.appendVersion();
        this._lastVersion = this.getAttr('value');
      }
    },

    appendVersion: function appendVersion() {
      var versions = this.versions;
      var firstTime = false;
      var newValue = this.getAttr('value');
      var oldValue;

      if (!versions) {
        firstTime = true;
        versions = _ember["default"].A();
      } else {
        oldValue = versions[0];
      }

      // TODO: may need to extend the comparison to do the same kind of
      // key-based diffing that htmlbars is doing.
      if (!firstTime && (!oldValue && !newValue || oldValue === newValue)) {
        return;
      }

      this.notifyContainer('willTransition', versions);
      var newVersion = {
        value: newValue,
        shouldRender: newValue || get(this, 'renderWhenFalse')
      };
      versions.unshiftObject(newVersion);

      this.firstTime = firstTime;
      if (firstTime) {
        set(this, 'versions', versions);
      }

      if (!newVersion.shouldRender && !firstTime) {
        this._transition();
      }
    },

    _transition: function _transition() {
      var _this = this;

      var versions = get(this, 'versions');
      var transition;
      var firstTime = this.firstTime;
      this.firstTime = false;

      this.notifyContainer('afterChildInsertion', versions);

      transition = get(this, 'transitionMap').transitionFor({
        versions: versions,
        parentElement: _ember["default"].$((0, _liquidFireEmberInternals.containingElement)(this)),
        use: get(this, 'use'),
        // Using strings instead of booleans here is an
        // optimization. The constraint system can match them more
        // efficiently, since it treats boolean constraints as generic
        // "match anything truthy/falsy" predicates, whereas string
        // checks are a direct object property lookup.
        firstTime: firstTime ? 'yes' : 'no',
        helperName: get(this, 'name'),
        outletName: get(this, 'outletName')
      });

      if (this._runningTransition) {
        this._runningTransition.interrupt();
      }
      this._runningTransition = transition;

      transition.run().then(function (wasInterrupted) {
        // if we were interrupted, we don't handle the cleanup because
        // another transition has already taken over.
        if (!wasInterrupted) {
          _this.finalizeVersions(versions);
          _this.notifyContainer("afterTransition", versions);
        }
      }, function (err) {
        _this.finalizeVersions(versions);
        _this.notifyContainer("afterTransition", versions);
        throw err;
      });
    },

    finalizeVersions: function finalizeVersions(versions) {
      versions.replace(1, versions.length - 1);
    },

    notifyContainer: function notifyContainer(method, versions) {
      var target = get(this, 'notify');
      if (target) {
        target.send(method, versions);
      }
    },

    actions: {
      childDidRender: function childDidRender(child) {
        var version = get(child, 'version');
        set(version, 'view', child);
        this._transition();
      }
    }

  });
});
define('rose/components/liquid-with', ['exports', 'ember'], function (exports, _ember) {

  var LiquidWith = _ember['default'].Component.extend({
    name: 'liquid-with',
    positionalParams: ['value'], // needed for Ember 1.13.[0-5] and 2.0.0-beta.[1-3] support
    tagName: '',
    iAmDeprecated: _ember['default'].on('init', function () {
      _ember['default'].deprecate("liquid-with is deprecated, use liquid-bind instead -- it accepts a block now.");
    })
  });

  LiquidWith.reopenClass({
    positionalParams: ['value']
  });

  exports['default'] = LiquidWith;
});
define("rose/components/lm-container", ["exports", "ember", "liquid-fire/tabbable"], function (exports, _ember, _liquidFireTabbable) {

  /**
   * If you do something to move focus outside of the browser (like
   * command+l to go to the address bar) and then tab back into the
   * window, capture it and focus the first tabbable element in an active
   * modal.
   */
  var lastOpenedModal = null;
  _ember["default"].$(document).on('focusin', handleTabIntoBrowser);

  function handleTabIntoBrowser() {
    if (lastOpenedModal) {
      lastOpenedModal.focus();
    }
  }

  exports["default"] = _ember["default"].Component.extend({
    classNames: ['lm-container'],
    attributeBindings: ['tabindex'],
    tabindex: 0,

    keyUp: function keyUp(event) {
      // Escape key
      if (event.keyCode === 27) {
        this.sendAction();
      }
    },

    keyDown: function keyDown(event) {
      // Tab key
      if (event.keyCode === 9) {
        this.constrainTabNavigation(event);
      }
    },

    didInsertElement: function didInsertElement() {
      this.focus();
      lastOpenedModal = this;
    },

    willDestroy: function willDestroy() {
      lastOpenedModal = null;
    },

    focus: function focus() {
      if (this.get('element').contains(document.activeElement)) {
        // just let it be if we already contain the activeElement
        return;
      }
      var target = this.$('[autofocus]');
      if (!target.length) {
        target = this.$(':tabbable');
      }

      if (!target.length) {
        target = this.$();
      }

      target[0].focus();
    },

    constrainTabNavigation: function constrainTabNavigation(event) {
      var tabbable = this.$(':tabbable');
      var finalTabbable = tabbable[event.shiftKey ? 'first' : 'last']()[0];
      var leavingFinalTabbable = finalTabbable === document.activeElement ||
      // handle immediate shift+tab after opening with mouse
      this.get('element') === document.activeElement;
      if (!leavingFinalTabbable) {
        return;
      }
      event.preventDefault();
      tabbable[event.shiftKey ? 'last' : 'first']()[0].focus();
    },

    click: function click(event) {
      if (event.target === this.get('element')) {
        this.sendAction('clickAway');
      }
    }
  });
});
/*
   Parts of this file were adapted from ic-modal

   https://github.com/instructure/ic-modal
   Released under The MIT License (MIT)
   Copyright (c) 2014 Instructure, Inc.
*/
define('rose/components/page-numbers', ['exports', 'ember', 'ember-cli-pagination/util', 'ember-cli-pagination/lib/page-items', 'ember-cli-pagination/validate'], function (exports, _ember, _emberCliPaginationUtil, _emberCliPaginationLibPageItems, _emberCliPaginationValidate) {
  exports['default'] = _ember['default'].Component.extend({
    currentPageBinding: "content.page",
    totalPagesBinding: "content.totalPages",

    hasPages: _ember['default'].computed.gt('totalPages', 1),

    watchInvalidPage: (function () {
      var me = this;
      var c = this.get('content');
      if (c && c.on) {
        c.on('invalidPage', function (e) {
          me.sendAction('invalidPageAction', e);
        });
      }
    }).observes("content"),

    truncatePages: true,
    numPagesToShow: 10,

    validate: function validate() {
      if (_emberCliPaginationUtil['default'].isBlank(this.get('currentPage'))) {
        _emberCliPaginationValidate['default'].internalError("no currentPage for page-numbers");
      }
      if (_emberCliPaginationUtil['default'].isBlank(this.get('totalPages'))) {
        _emberCliPaginationValidate['default'].internalError('no totalPages for page-numbers');
      }
    },

    pageItemsObj: (function () {
      return _emberCliPaginationLibPageItems['default'].create({
        parent: this,
        currentPageBinding: "parent.currentPage",
        totalPagesBinding: "parent.totalPages",
        truncatePagesBinding: "parent.truncatePages",
        numPagesToShowBinding: "parent.numPagesToShow",
        showFLBinding: "parent.showFL"
      });
    }).property(),

    //pageItemsBinding: "pageItemsObj.pageItems",

    pageItems: (function () {
      this.validate();
      return this.get("pageItemsObj.pageItems");
    }).property("pageItemsObj.pageItems", "pageItemsObj"),

    canStepForward: (function () {
      var page = Number(this.get("currentPage"));
      var totalPages = Number(this.get("totalPages"));
      return page < totalPages;
    }).property("currentPage", "totalPages"),

    canStepBackward: (function () {
      var page = Number(this.get("currentPage"));
      return page > 1;
    }).property("currentPage"),

    actions: {
      pageClicked: function pageClicked(number) {
        _emberCliPaginationUtil['default'].log("PageNumbers#pageClicked number " + number);
        this.set("currentPage", number);
        this.sendAction('action', number);
      },
      incrementPage: function incrementPage(num) {
        var currentPage = Number(this.get("currentPage")),
            totalPages = Number(this.get("totalPages"));

        if (currentPage === totalPages && num === 1) {
          return false;
        }
        if (currentPage <= 1 && num === -1) {
          return false;
        }
        this.incrementProperty('currentPage', num);

        var newPage = this.get('currentPage');
        this.sendAction('action', newPage);
      }
    }
  });
});
define('rose/components/ui-accordion', ['exports', 'semantic-ui-ember/components/ui-accordion'], function (exports, _semanticUiEmberComponentsUiAccordion) {
  exports['default'] = _semanticUiEmberComponentsUiAccordion['default'];
});
define('rose/components/ui-checkbox', ['exports', 'semantic-ui-ember/components/ui-checkbox'], function (exports, _semanticUiEmberComponentsUiCheckbox) {
  exports['default'] = _semanticUiEmberComponentsUiCheckbox['default'];
});
define('rose/components/ui-dropdown-item', ['exports', 'semantic-ui-ember/components/ui-dropdown-item'], function (exports, _semanticUiEmberComponentsUiDropdownItem) {
  exports['default'] = _semanticUiEmberComponentsUiDropdownItem['default'];
});
define('rose/components/ui-dropdown', ['exports', 'semantic-ui-ember/components/ui-dropdown'], function (exports, _semanticUiEmberComponentsUiDropdown) {
  exports['default'] = _semanticUiEmberComponentsUiDropdown['default'];
});
define('rose/components/ui-embed', ['exports', 'semantic-ui-ember/components/ui-embed'], function (exports, _semanticUiEmberComponentsUiEmbed) {
  exports['default'] = _semanticUiEmberComponentsUiEmbed['default'];
});
define('rose/components/ui-modal', ['exports', 'semantic-ui-ember/components/ui-modal'], function (exports, _semanticUiEmberComponentsUiModal) {
  exports['default'] = _semanticUiEmberComponentsUiModal['default'];
});
define('rose/components/ui-nag', ['exports', 'semantic-ui-ember/components/ui-nag'], function (exports, _semanticUiEmberComponentsUiNag) {
  exports['default'] = _semanticUiEmberComponentsUiNag['default'];
});
define('rose/components/ui-popup', ['exports', 'semantic-ui-ember/components/ui-popup'], function (exports, _semanticUiEmberComponentsUiPopup) {
  exports['default'] = _semanticUiEmberComponentsUiPopup['default'];
});
define('rose/components/ui-progress', ['exports', 'semantic-ui-ember/components/ui-progress'], function (exports, _semanticUiEmberComponentsUiProgress) {
  exports['default'] = _semanticUiEmberComponentsUiProgress['default'];
});
define('rose/components/ui-radio', ['exports', 'semantic-ui-ember/components/ui-radio'], function (exports, _semanticUiEmberComponentsUiRadio) {
  exports['default'] = _semanticUiEmberComponentsUiRadio['default'];
});
define('rose/components/ui-rating', ['exports', 'semantic-ui-ember/components/ui-rating'], function (exports, _semanticUiEmberComponentsUiRating) {
  exports['default'] = _semanticUiEmberComponentsUiRating['default'];
});
define('rose/components/ui-search', ['exports', 'semantic-ui-ember/components/ui-search'], function (exports, _semanticUiEmberComponentsUiSearch) {
  exports['default'] = _semanticUiEmberComponentsUiSearch['default'];
});
define('rose/components/ui-shape', ['exports', 'semantic-ui-ember/components/ui-shape'], function (exports, _semanticUiEmberComponentsUiShape) {
  exports['default'] = _semanticUiEmberComponentsUiShape['default'];
});
define('rose/components/ui-sidebar', ['exports', 'semantic-ui-ember/components/ui-sidebar'], function (exports, _semanticUiEmberComponentsUiSidebar) {
  exports['default'] = _semanticUiEmberComponentsUiSidebar['default'];
});
define('rose/components/ui-sticky', ['exports', 'semantic-ui-ember/components/ui-sticky'], function (exports, _semanticUiEmberComponentsUiSticky) {
  exports['default'] = _semanticUiEmberComponentsUiSticky['default'];
});
define('rose/controllers/application', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Controller.extend({
    isLoading: false,

    actions: {
      cancelWizard: function cancelWizard() {
        var settings = this.get('settings.user');
        settings.set('firstRun', false);
        settings.save().then(function () {
          return location.reload();
        });
      },

      saveConfig: function saveConfig(data) {
        var _this = this;

        var payload = JSON.parse(data);
        payload.id = 0;

        this.store.find('system-config', { id: 0 }).then(function (configs) {
          if (!_ember['default'].isEmpty(configs)) {
            return configs.get('firstObject').destroyRecord();
          }
        }).then(function () {
          kango.dispatchMessage('LoadNetworks', payload.networks);
          delete payload.networks;
          return _this.store.createRecord('system-config', payload).save();
        }).then(function () {
          return _this.send('cancelWizard');
        });
      }
    }
  });
});
define('rose/controllers/array', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Controller;
});
define('rose/controllers/backup', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Controller.extend({
    jsonData: (function () {
      var result = {};

      var models = this.get('model');

      models.forEach(function (model) {
        result[model.type] = model.data;
      });

      result['export-date'] = new Date().toJSON();

      return JSON.stringify(result, null, 4);
    }).property('model'),

    actions: {
      openModal: function openModal(name) {
        _ember['default'].$('.ui.' + name + '.modal').modal('show');
      },

      download: function download() {
        window.saveAs(new Blob([this.get('jsonData')]), 'rose-data.txt');
      },

      approveModal: function approveModal() {
        var _this = this;

        ['comment', 'interaction', 'diary-entry'].forEach(function (type) {
          return _this.store.find(type).then(function (records) {
            return records.invoke('destroyRecord');
          });
        });

        ['click', 'fb-login', 'mousemove', 'scroll', 'window'].forEach(function (type) {
          return kango.invokeAsyncCallback('localforage.removeItem', type + '-activity-records');
        });

        return true;
      }
    }
  });
});
define('rose/controllers/comments', ['exports', 'ember', 'ember-cli-pagination/computed/paged-array'], function (exports, _ember, _emberCliPaginationComputedPagedArray) {
  exports['default'] = _ember['default'].Controller.extend({
    listSorting: ['createdAt:desc'],
    sortedList: _ember['default'].computed.sort('model', 'listSorting'),

    queryParams: ["page"],
    page: 1,
    perPage: 20,
    pagedContent: (0, _emberCliPaginationComputedPagedArray['default'])('sortedList', { pageBinding: "page", perPageBinding: "perPage" }),
    totalPagesBinding: "pagedContent.totalPages"
  });
});
define('rose/controllers/debug-log', ['exports', 'ember', 'ember-cli-pagination/computed/paged-array'], function (exports, _ember, _emberCliPaginationComputedPagedArray) {
    exports['default'] = _ember['default'].Controller.extend({
        model: [],
        queryParams: ["page"],
        page: 1,
        perPage: 20,
        pagedContent: (0, _emberCliPaginationComputedPagedArray['default'])('model', { pageBinding: "page", perPageBinding: "perPage" }),
        totalPagesBinding: "pagedContent.totalPages"
    });
});
define('rose/controllers/diary', ['exports', 'ember', 'ember-cli-pagination/computed/paged-array'], function (exports, _ember, _emberCliPaginationComputedPagedArray) {
  exports['default'] = _ember['default'].Controller.extend({
    listSorting: ['createdAt:desc'],
    sortedList: _ember['default'].computed.sort('model', 'listSorting'),

    queryParams: ["page"],
    page: 1,
    perPage: 20,
    pagedContent: (0, _emberCliPaginationComputedPagedArray['default'])('sortedList', { pageBinding: "page", perPageBinding: "perPage" }),
    totalPagesBinding: "pagedContent.totalPages",

    diaryInputIsEmpty: _ember['default'].computed.empty('diaryInput'),

    actions: {
      save: function save() {
        var entry = {
          text: this.get('diaryInput')
        };
        this.store.createRecord('diary-entry', entry).save();
        this.set('diaryInput', null);
      },
      cancel: function cancel() {
        this.set('diaryInput', null);
      }
    }
  });
});
define('rose/controllers/extracts', ['exports', 'ember', 'ember-cli-pagination/computed/paged-array'], function (exports, _ember, _emberCliPaginationComputedPagedArray) {
  exports['default'] = _ember['default'].Controller.extend({
    listSorting: ['createdAt:desc'],
    sortedList: _ember['default'].computed.sort('model', 'listSorting'),

    queryParams: ["page"],
    page: 1,
    perPage: 20,
    pagedContent: (0, _emberCliPaginationComputedPagedArray['default'])('sortedList', { pageBinding: "page", perPageBinding: "perPage" }),
    totalPagesBinding: "pagedContent.totalPages"
  });
});
define('rose/controllers/index', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Controller.extend({
    clickChartOptions: {
      chart: {
        type: 'column'
      },
      title: {
        text: 'Mouse Clicks'
      },
      xAxis: {
        ordinal: false
      },
      yAxis: {
        title: {
          text: 'Number of Clicks'
        },
        allowDecimals: false
      }
    },

    clickChartData: _ember['default'].computed('model', function () {
      var model = this.get('model');
      var data = model[0];

      if (data) {
        return [{
          data: data.map(function (record) {
            return [record.date, record.value];
          })
        }];
      }
    }),

    mouseMoveChartOptions: {
      chart: {
        type: 'column'
      },
      title: {
        text: 'Mouse Movement'
      },
      xAxis: {
        ordinal: false
      },
      yAxis: {
        title: {
          text: 'Distance in Pixels'
        },
        allowDecimals: false
      }
    },

    mouseMoveChartData: _ember['default'].computed('model', function () {
      var model = this.get('model');
      var data = model[1];

      if (data) {
        return [{
          data: data.map(function (record) {
            return [record.date, record.value];
          })
        }];
      }
    }),

    scrollChartOptions: {
      chart: {
        type: 'column'
      },
      title: {
        text: 'Page Scroll'
      },
      xAxis: {
        ordinal: false
      },
      yAxis: {
        title: {
          text: 'Distance in Pixels'
        },
        allowDecimals: false
      }
    },

    scrollChartData: _ember['default'].computed('model', function () {
      var model = this.get('model');
      var data = model[2];

      if (data) {
        return [{
          data: data.map(function (record) {
            return [record.date, record.value];
          })
        }];
      }
    }),

    windowChartOptions: {
      chart: {
        type: 'line',
        zoomType: 'x'
      },
      title: {
        text: 'Window Activity'
      },
      xAxis: {
        ordinal: false
      },
      yAxis: {
        title: {
          text: 'Window Status'
        },
        allowDecimals: false
      },
      navigator: {
        series: {
          type: 'column'
        }
      }
    },

    windowChartData: _ember['default'].computed('model', function () {
      var model = this.get('model');
      var data = model[3];

      if (data) {
        return [{
          step: true,
          data: data.map(function (record) {
            var status = (function (value) {
              if (value.open && value.active) return 2;else if (value.open && !value.active) return 1;else if (!value.open && !value.active) return 0;else throw new Error('window activity tracker data is corrupt');
            })(record.value);
            return [record.date, status];
          })
        }];
      }
    }),

    loginChartOptions: {
      chart: {
        type: 'line',
        zoomType: 'x'
      },
      title: {
        text: 'Login Status'
      },
      xAxis: {
        ordinal: false
      },
      yAxis: {
        title: {
          text: 'Distance in Pixels'
        },
        allowDecimals: false
      },
      navigator: {
        series: {
          type: 'column'
        }
      }
    },

    loginChartData: _ember['default'].computed('model', function () {
      var model = this.get('model');
      var data = model[4];

      if (data) {
        return [{
          step: true,
          data: data.map(function (record) {
            var status = (function (value) {
              if (!value) return 0;else return 1;
            })(record.value);
            return [record.date, status];
          })
        }];
      }
    })
  });
});
define('rose/controllers/interactions', ['exports', 'ember', 'ember-cli-pagination/computed/paged-array'], function (exports, _ember, _emberCliPaginationComputedPagedArray) {
  exports['default'] = _ember['default'].Controller.extend({
    listSorting: ['createdAt:desc'],
    sortedList: _ember['default'].computed.sort('model', 'listSorting'),

    queryParams: ["page"],
    page: 1,
    perPage: 20,
    pagedContent: (0, _emberCliPaginationComputedPagedArray['default'])('sortedList', { pageBinding: "page", perPageBinding: "perPage" }),
    totalPagesBinding: "pagedContent.totalPages"
  });
});
define('rose/controllers/object', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Controller;
});
define('rose/controllers/settings', ['exports', 'ember', 'rose/locales/languages'], function (exports, _ember, _roseLocalesLanguages) {
  var Promise = _ember['default'].RSVP.Promise;
  exports['default'] = _ember['default'].Controller.extend({
    updateInProgress: false,
    availableLanguages: _roseLocalesLanguages['default'],
    updateIntervals: [{ label: 'hourly', value: 3600000 }, { label: 'daily', value: 86400000 }, { label: 'weekly', value: 604800000 }, { label: 'monthly', value: 2629743830 }, { label: 'yearly', value: 31556926000 }],

    actions: {
      saveSettings: function saveSettings() {
        this.get('settings.user').save();
        this.get('settings.system').save();
      },

      changeI18nLanguage: function changeI18nLanguage() {
        this.set('i18n.locale', this.get('settings.user.currentLanguage'));
        this.send('saveSettings');
      },

      manualUpdate: function manualUpdate() {
        var _this = this;

        this.set('updateInProgress', true);
        kango.dispatchMessage('update-start');

        kango.addMessageListener('update-successful', function () {
          _this.set('updateInProgress', false);
          _this.get('settings.system').reload().then(function () {
            kango.removeMessageListener('update-result');
          });
        });
      },

      openModal: function openModal(name) {
        _ember['default'].$('.ui.' + name + '.modal').modal('show');
      },

      approveModal: function approveModal() {
        var _this2 = this;

        return Promise.all([this.store.find('extractor').then(function (records) {
          return records.invoke('destroyRecord');
        }), this.store.find('network').then(function (records) {
          return records.invoke('destroyRecord');
        }), this.store.find('observer').then(function (records) {
          return records.invoke('destroyRecord');
        }), this.get('settings.user').destroyRecord(), this.get('settings.system').destroyRecord()]).then(function () {
          return _this2.get('settings').setup();
        }).then(function () {
          return _this2.transitionToRoute('index');
        });
      }
    }
  });
});
define('rose/controllers/study-creator', ['exports', 'ember', 'npm:normalize-url'], function (exports, _ember, _npmNormalizeUrl) {

  function removeFileName(str) {
    return (0, _npmNormalizeUrl['default'])(str.substring(0, str.lastIndexOf('/')));
  }

  exports['default'] = _ember['default'].Controller.extend({
    baseFileIsLoading: false,
    baseFileNotFound: false,
    networks: [],

    updateIntervals: [{ label: 'hourly', value: 3600000 }, { label: 'daily', value: 86400000 }, { label: 'weekly', value: 604800000 }, { label: 'monthly', value: 2629743830 }],

    getExtractors: function getExtractors(url) {
      return _ember['default'].$.getJSON(url).then(function (list) {
        return list.map(function (item) {
          return _ember['default'].Object.create(item);
        });
      });
    },

    getObservers: function getObservers(url) {
      return _ember['default'].$.getJSON(url).then(function (list) {
        return list.map(function (item) {
          return _ember['default'].Object.create(item);
        });
      });
    },

    actions: {
      saveSettings: function saveSettings() {
        this.set('model.repositoryURL', (0, _npmNormalizeUrl['default'])(this.get('model.repositoryURL')));
        this.get('model').save();
      },

      saveNetworkSettings: function saveNetworkSettings(network) {
        network.value.save();
      },

      download: function download() {
        var networks = this.get('networks').filterBy('isEnabled', true).map(function (network) {
          return JSON.parse(JSON.stringify(network));
        }).map(function (network) {
          if (network.extractors) {
            network.extractors = network.extractors.filter(function (extractor) {
              return extractor.isEnabled;
            });
          }
          if (network.observers) {
            network.observers = network.observers.filter(function (observer) {
              return observer.isEnabled;
            });
          }
          return network;
        });

        var model = this.get('model').toJSON();
        model.networks = networks;
        var jsondata = JSON.stringify(model, null, 4);
        var fileName = this.get('model.fileName');

        window.saveAs(new Blob([jsondata]), fileName);
      },

      fetchBaseFile: function fetchBaseFile() {
        var _this = this;

        // this.set('networks', [])
        this.setProperties({
          networks: [],
          baseFileNotFound: false
        });

        var baseFileUrl = this.get('model.repositoryURL');
        var repositoryURL = removeFileName(baseFileUrl);

        _ember['default'].$.getJSON(baseFileUrl).then(function (baseJSON) {
          if (baseJSON.networks) {
            var networks = baseJSON.networks;
            networks.forEach(function (network) {
              _ember['default'].RSVP.Promise.all([_this.getExtractors(repositoryURL + '/' + network.extractors), _this.getObservers(repositoryURL + '/' + network.observers)]).then(function (results) {
                network.extractors = results[0];
                network.observers = results[1];
                _this.get('networks').pushObject(_ember['default'].Object.create(network));
              });
            });
          }
        }).fail(function () {
          return _this.set('baseFileNotFound', true);
        });
      },

      enableAll: function enableAll(itemList) {
        itemList.forEach(function (item) {
          return item.set('isEnabled', true);
        });
      },

      disableAll: function disableAll(itemList) {
        itemList.forEach(function (item) {
          return item.set('isEnabled', false);
        });
      }
    }
  });
});
define('rose/defaults/study-creator', ['exports'], function (exports) {
  exports['default'] = {
    roseCommentsIsEnabled: true,
    roseCommentsRatingIsEnabled: true,
    salt: 'ROSE',
    hashLength: 8,
    repositoryURL: 'https://secure-software-engineering.github.io/rose/example/',
    fingerprint: '25E769C697EC2C20DA3BDDE9F188CF170FA234E8',
    autoUpdateIsEnabled: true,
    updateInterval: 86400000,
    fileName: 'rose-study-configuration.txt'
  };
});
define('rose/helpers/and', ['exports', 'ember', 'ember-truth-helpers/helpers/and'], function (exports, _ember, _emberTruthHelpersHelpersAnd) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersAnd.andHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersAnd.andHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/boolean-to-yesno', ['exports', 'ember', 'ember-i18n'], function (exports, _ember, _emberI18n) {
  exports.booleanToYesno = booleanToYesno;

  function booleanToYesno(params) {
    return params[0] ? (0, _emberI18n.translationMacro)('on') : (0, _emberI18n.translationMacro)('off');
  }

  exports['default'] = _ember['default'].HTMLBars.makeBoundHelper(booleanToYesno);
});
define('rose/helpers/eq', ['exports', 'ember', 'ember-truth-helpers/helpers/equal'], function (exports, _ember, _emberTruthHelpersHelpersEqual) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersEqual.equalHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersEqual.equalHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/gt', ['exports', 'ember', 'ember-truth-helpers/helpers/gt'], function (exports, _ember, _emberTruthHelpersHelpersGt) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersGt.gtHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersGt.gtHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/gte', ['exports', 'ember', 'ember-truth-helpers/helpers/gte'], function (exports, _ember, _emberTruthHelpersHelpersGte) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersGte.gteHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersGte.gteHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/is-array', ['exports', 'ember', 'ember-truth-helpers/helpers/is-array'], function (exports, _ember, _emberTruthHelpersHelpersIsArray) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersIsArray.isArrayHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersIsArray.isArrayHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/lt', ['exports', 'ember', 'ember-truth-helpers/helpers/lt'], function (exports, _ember, _emberTruthHelpersHelpersLt) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersLt.ltHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersLt.ltHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/lte', ['exports', 'ember', 'ember-truth-helpers/helpers/lte'], function (exports, _ember, _emberTruthHelpersHelpersLte) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersLte.lteHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersLte.lteHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/moment-duration', ['exports', 'ember-moment/helpers/moment-duration'], function (exports, _emberMomentHelpersMomentDuration) {
  Object.defineProperty(exports, 'default', {
    enumerable: true,
    get: function get() {
      return _emberMomentHelpersMomentDuration['default'];
    }
  });
});
define('rose/helpers/moment-format', ['exports', 'ember', 'rose/config/environment', 'ember-moment/helpers/moment-format'], function (exports, _ember, _roseConfigEnvironment, _emberMomentHelpersMomentFormat) {
  exports['default'] = _emberMomentHelpersMomentFormat['default'].extend({
    globalOutputFormat: _ember['default'].get(_roseConfigEnvironment['default'], 'moment.outputFormat'),
    globalAllowEmpty: !!_ember['default'].get(_roseConfigEnvironment['default'], 'moment.allowEmpty')
  });
});
define('rose/helpers/moment-from-now', ['exports', 'ember', 'rose/config/environment', 'ember-moment/helpers/moment-from-now'], function (exports, _ember, _roseConfigEnvironment, _emberMomentHelpersMomentFromNow) {
  exports['default'] = _emberMomentHelpersMomentFromNow['default'].extend({
    globalAllowEmpty: !!_ember['default'].get(_roseConfigEnvironment['default'], 'moment.allowEmpty')
  });
});
define('rose/helpers/moment-to-now', ['exports', 'ember', 'rose/config/environment', 'ember-moment/helpers/moment-to-now'], function (exports, _ember, _roseConfigEnvironment, _emberMomentHelpersMomentToNow) {
  exports['default'] = _emberMomentHelpersMomentToNow['default'].extend({
    globalAllowEmpty: !!_ember['default'].get(_roseConfigEnvironment['default'], 'moment.allowEmpty')
  });
});
define('rose/helpers/not-eq', ['exports', 'ember', 'ember-truth-helpers/helpers/not-equal'], function (exports, _ember, _emberTruthHelpersHelpersNotEqual) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersNotEqual.notEqualHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersNotEqual.notEqualHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/not', ['exports', 'ember', 'ember-truth-helpers/helpers/not'], function (exports, _ember, _emberTruthHelpersHelpersNot) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersNot.notHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersNot.notHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/or', ['exports', 'ember', 'ember-truth-helpers/helpers/or'], function (exports, _ember, _emberTruthHelpersHelpersOr) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersOr.orHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersOr.orHelper);
  }

  exports['default'] = forExport;
});
define('rose/helpers/xor', ['exports', 'ember', 'ember-truth-helpers/helpers/xor'], function (exports, _ember, _emberTruthHelpersHelpersXor) {

  var forExport = null;

  if (_ember['default'].Helper) {
    forExport = _ember['default'].Helper.helper(_emberTruthHelpersHelpersXor.xorHelper);
  } else if (_ember['default'].HTMLBars.makeBoundHelper) {
    forExport = _ember['default'].HTMLBars.makeBoundHelper(_emberTruthHelpersHelpersXor.xorHelper);
  }

  exports['default'] = forExport;
});
define('rose/initializers/app-version', ['exports', 'ember-cli-app-version/initializer-factory', 'rose/config/environment'], function (exports, _emberCliAppVersionInitializerFactory, _roseConfigEnvironment) {
  exports['default'] = {
    name: 'App Version',
    initialize: (0, _emberCliAppVersionInitializerFactory['default'])(_roseConfigEnvironment['default'].APP.name, _roseConfigEnvironment['default'].APP.version)
  };
});
define("rose/initializers/ember-i18n", ["exports", "rose/instance-initializers/ember-i18n"], function (exports, _roseInstanceInitializersEmberI18n) {
  exports["default"] = {
    name: _roseInstanceInitializersEmberI18n["default"].name,

    initialize: function initialize(registry, application) {
      if (application.instanceInitializer) {
        return;
      }

      _roseInstanceInitializersEmberI18n["default"].initialize(application);
    }
  };
});
define('rose/initializers/export-application-global', ['exports', 'ember', 'rose/config/environment'], function (exports, _ember, _roseConfigEnvironment) {
  exports.initialize = initialize;

  function initialize() {
    var application = arguments[1] || arguments[0];
    if (_roseConfigEnvironment['default'].exportApplicationGlobal !== false) {
      var value = _roseConfigEnvironment['default'].exportApplicationGlobal;
      var globalName;

      if (typeof value === 'string') {
        globalName = value;
      } else {
        globalName = _ember['default'].String.classify(_roseConfigEnvironment['default'].modulePrefix);
      }

      if (!window[globalName]) {
        window[globalName] = application;

        application.reopen({
          willDestroy: function willDestroy() {
            this._super.apply(this, arguments);
            delete window[globalName];
          }
        });
      }
    }
  }

  exports['default'] = {
    name: 'export-application-global',

    initialize: initialize
  };
});
define('rose/initializers/i18n', ['exports', 'ember-i18n-inject/initializers/i18n'], function (exports, _emberI18nInjectInitializersI18n) {
  Object.defineProperty(exports, 'default', {
    enumerable: true,
    get: function get() {
      return _emberI18nInjectInitializersI18n['default'];
    }
  });
  Object.defineProperty(exports, 'initialize', {
    enumerable: true,
    get: function get() {
      return _emberI18nInjectInitializersI18n.initialize;
    }
  });
});
define('rose/initializers/kango-api', ['exports'], function (exports) {
  exports.initialize = initialize;

  function initialize(container, application) {
    application.deferReadiness();

    KangoAPI.onReady(function () {
      application.advanceReadiness();
    });
  }

  exports['default'] = {
    name: 'kango-api',
    initialize: initialize
  };
});
define("rose/initializers/liquid-fire", ["exports", "liquid-fire/router-dsl-ext", "liquid-fire/ember-internals"], function (exports, _liquidFireRouterDslExt, _liquidFireEmberInternals) {
  (0, _liquidFireEmberInternals.registerKeywords)();

  exports["default"] = {
    name: 'liquid-fire',
    initialize: function initialize() {}
  };
});
// This initializer exists only to make sure that the following
// imports happen before the app boots.
define('rose/initializers/settings', ['exports'], function (exports) {
    exports.initialize = initialize;

    function initialize(container, application) {
        application.inject('route', 'settings', 'service:settings');
        application.inject('controller', 'settings', 'service:settings');
    }

    exports['default'] = {
        name: 'settings',
        initialize: initialize
    };
});
define('rose/initializers/truth-helpers', ['exports', 'ember', 'ember-truth-helpers/utils/register-helper', 'ember-truth-helpers/helpers/and', 'ember-truth-helpers/helpers/or', 'ember-truth-helpers/helpers/equal', 'ember-truth-helpers/helpers/not', 'ember-truth-helpers/helpers/is-array', 'ember-truth-helpers/helpers/not-equal', 'ember-truth-helpers/helpers/gt', 'ember-truth-helpers/helpers/gte', 'ember-truth-helpers/helpers/lt', 'ember-truth-helpers/helpers/lte'], function (exports, _ember, _emberTruthHelpersUtilsRegisterHelper, _emberTruthHelpersHelpersAnd, _emberTruthHelpersHelpersOr, _emberTruthHelpersHelpersEqual, _emberTruthHelpersHelpersNot, _emberTruthHelpersHelpersIsArray, _emberTruthHelpersHelpersNotEqual, _emberTruthHelpersHelpersGt, _emberTruthHelpersHelpersGte, _emberTruthHelpersHelpersLt, _emberTruthHelpersHelpersLte) {
  exports.initialize = initialize;

  function initialize() /* container, application */{

    // Do not register helpers from Ember 1.13 onwards, starting from 1.13 they
    // will be auto-discovered.
    if (_ember['default'].Helper) {
      return;
    }

    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('and', _emberTruthHelpersHelpersAnd.andHelper);
    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('or', _emberTruthHelpersHelpersOr.orHelper);
    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('eq', _emberTruthHelpersHelpersEqual.equalHelper);
    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('not', _emberTruthHelpersHelpersNot.notHelper);
    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('is-array', _emberTruthHelpersHelpersIsArray.isArrayHelper);
    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('not-eq', _emberTruthHelpersHelpersNotEqual.notEqualHelper);
    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('gt', _emberTruthHelpersHelpersGt.gtHelper);
    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('gte', _emberTruthHelpersHelpersGte.gteHelper);
    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('lt', _emberTruthHelpersHelpersLt.ltHelper);
    (0, _emberTruthHelpersUtilsRegisterHelper.registerHelper)('lte', _emberTruthHelpersHelpersLte.lteHelper);
  }

  exports['default'] = {
    name: 'truth-helpers',
    initialize: initialize
  };
});
define("rose/instance-initializers/ember-i18n", ["exports", "ember", "ember-i18n/legacy-helper", "ember-i18n/helper", "rose/config/environment"], function (exports, _ember, _emberI18nLegacyHelper, _emberI18nHelper, _roseConfigEnvironment) {
  exports["default"] = {
    name: 'ember-i18n',

    initialize: function initialize(instance) {
      var defaultLocale = (_roseConfigEnvironment["default"].i18n || {}).defaultLocale;
      if (defaultLocale === undefined) {
        _ember["default"].warn('ember-i18n did not find a default locale; falling back to "en".');
        defaultLocale = 'en';
      }
      instance.container.lookup('service:i18n').set('locale', defaultLocale);

      if (_emberI18nLegacyHelper["default"] != null) {
        _ember["default"].HTMLBars._registerHelper('t', _emberI18nLegacyHelper["default"]);
      }

      if (_emberI18nHelper["default"] != null) {
        instance.registry.register('helper:t', _emberI18nHelper["default"]);
      }
    }
  };
});
define('rose/liquid-fire/tests/modules/liquid-fire/action.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/action.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/action.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/animate.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/animate.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/animate.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/components/liquid-measured.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire/components');
  QUnit.test('modules/liquid-fire/components/liquid-measured.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/components/liquid-measured.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/components/liquid-spacer.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire/components');
  QUnit.test('modules/liquid-fire/components/liquid-spacer.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/components/liquid-spacer.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/constrainables.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/constrainables.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/constrainables.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/constraint.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/constraint.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/constraint.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/constraints.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/constraints.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/constraints.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/dsl.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/dsl.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/dsl.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/ember-internals.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/ember-internals.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/ember-internals.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/growable.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/growable.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/growable.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/index.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/index.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/index.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/internal-rules.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/internal-rules.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/internal-rules.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/modal.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/modal.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/modal.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/modals.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/modals.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/modals.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/mutation-observer.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/mutation-observer.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/mutation-observer.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/promise.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/promise.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/promise.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/router-dsl-ext.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/router-dsl-ext.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/router-dsl-ext.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/rule.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/rule.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/rule.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/running-transition.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/running-transition.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/running-transition.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/tabbable.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/tabbable.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/tabbable.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/transition-map.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/transition-map.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/transition-map.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/velocity-ext.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/velocity-ext.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/velocity-ext.js should pass jshint.');
  });
});
define('rose/liquid-fire/tests/modules/liquid-fire/version-warnings.jshint', ['exports'], function (exports) {
  QUnit.module('JSHint - modules/liquid-fire');
  QUnit.test('modules/liquid-fire/version-warnings.js should pass jshint', function (assert) {
    assert.expect(1);
    assert.ok(true, 'modules/liquid-fire/version-warnings.js should pass jshint.');
  });
});
define("rose/locales/de/config", ["exports"], function (exports) {
  // Ember-I18n inclues configuration for common locales. Most users
  // can safely delete this file. Use it if you need to override behavior
  // for a locale or define behavior for a locale that Ember-I18n
  // doesn't know about.
  exports["default"] = {
    // rtl: [true|FALSE],
    //
    // pluralForm: function(count) {
    //   if (count === 0) { return 'zero'; }
    //   if (count === 1) { return 'one'; }
    //   if (count === 2) { return 'two'; }
    //   if (count < 5) { return 'few'; }
    //   if (count >= 5) { return 'many'; }
    //   return 'other';
    // }
  };
});
define("rose/locales/de/translations", ["exports"], function (exports) {
  exports["default"] = {
    // General
    and: "and",
    yes: "Yes",
    no: "No",
    on: "On",
    off: "Off",

    action: {
      save: "Save",
      cancel: "Cancel",
      edit: "Edit",
      hide: "Hide",
      unhide: "Unhide",
      "delete": "Delete",
      download: "Download",
      details: "Details"
    },

    // Sidebar Menu
    sidebarMenu: {
      diary: "Diary",
      backup: "Backup",
      settings: "Settings",
      comments: "Comments",
      interactions: "Interactions",
      extracts: "Extracts",
      networks: "Networks",
      more: "More",
      help: "Help",
      about: "About",
      extraFeatures: "Extra Features",
      studyCreator: "Study Creator"
    },

    wizard: {
      header: "Welcome to ROSE",
      description: "In this step we first need to configure ROSE to work properly.",
      configOptions: "Choose one option to configure ROSE.",
      defaultConfig: "Take the default configuration.",
      fileConfig: "Select a configuration file...",
      fileConfigBtn: "Choose file",
      urlConfig: "Specifiy a URL to an ROSE repository..."
    },

    // Diary Page
    diary: {
      title: "Diary",
      subtitle: "Here you can make a note of everything else that attracted your attention"
    },

    // Backup Page
    backup: {
      title: "Data Backup",
      subtitle: "Here you can review, save or restore all data you supplied or which was recorded by ROSE"
    },

    // Settings Page
    settings: {
      title: "Einstellungen",
      subtitle: "Hier können Sie Ihre ROSE Einstellungen anpassen",
      language: "Language",
      languageLabel: "Choose your preferred language. ROSE can also adopt the browser language (\"auto detect\" option).",
      commentReminder: "Comment Reminder",
      commentReminderLabel: "ROSE can ocassionally display reminders to remember you to comment on your actions if that is required by the study you are participating in. You can deactivate this features if it disturbs you.",
      extraFeatures: "Extra Features",
      extraFeaturesLabel: "ROSE has additional features for field researchers and ROSE developers. These features are normally not visible, but can be activated here.",
      resetRose: "ROSE Zurücksetzen",
      resetRoseLabel: "Here you can reset ROSE's configurations. The initialization wizard will appear again asking you to load either a default configuration or a specific study configuration file."
    },

    // Comments Page
    comments: {
      title: "Comments",
      subtitle: "Have a look at all your comments",

      you: "You",
      commentedOn: "commented on"
    },

    // Interactions Page
    interactions: {
      title: "Interactions",
      subtitle: "All your recent interactions",
      actionOn: "action on"
    },

    // Extracts Settings Page
    extracts: {
      title: "Extracts",
      subtitle: "ROSE extracted these information"
    },

    // Help Page
    help: {
      title: "Usage notes",
      subtitle: "Frequently asked questions about ROSE",

      issue1: {
        question: "Where does ROSE collect the data about my Facebook usage and my inserted comments?",
        answer: "<p>ROSE exclusively collects data in your web browser. ROSE can provide a pre-assembled Mail which you can use to transmit your data to the study advisor. ROSE does not transmit data to Facebook; Facebook can not detect your usage of ROSE with their computer systems. ROSE neither transmits data itself to the study advisor nor receives them.</p><p>There is a disadvantage of this privacy aware concept of ROSE, though: ROSE data can be lost in case system bugs emerge on your computer. With the deletion of ROSE from your web browser all stored data is irretrievably lost.</p>"
      },
      issue2: {
        question: "Are my ROSE study comments visible for other study participants or Facebook users?",
        answer: "<p>No, this is impossible for technical reasons. The distribution and therefore visibility for other study participants or Facebook users is impossible because ROSE does not transmit data to Facebook computer systems or to the study advisory. ROSE does not receive data either. Furthermore, Facebook can not even find out about whether you are using ROSE or not. Even though ROSE has a close integration in your web browser and the Facebook interface and therefore is much alike to the &quot;real&quot; Facebook functions this &quot;illusion of an extended Facebook&quot; completely and exclusively takes place in your web browser with ROSE.</p>"
      },
      issue3: {
        question: "Which data is being recorded by ROSE?",
        answer: "<p>ROSE records the following data:</p><ul><li><b>Date and time of interactions in Facebook</b>, e.g., the time the study participant publishes a story item on his/her Timeline.</li><li><b>Type of interaction</b>, e.g., &quot;creating a story item&quot;.</li><li><b>Unique identifiers</b>, which mark the context of interactions. Identifiers are an eight-digit combination of letters and numbers, e.g., &quot;2a2d6fc3&quot;. With commenting on a picture the identifiers correspond to the picture you commented on. Thereby the study advisory can detect if multiple study participants commented on the same picture without ever learning about the content of this picture.</li><li><b>Privacy settings concerning interactions</b>, e.g. whether a story item is visible for &quot;Friends&quot;only or for &quot;Everyone&quot;.</li><li><b>Diary entries.</b></li><li><b>ROSE study comments.</b></li><li><b>Privacy settings in general.</b></li></ul>"
      },
      issue4: {
        question: "Does ROSE collect data which I am sharing with my friends on Facebook?",
        answer: "<p>No. ROSE does not collect any data which you are sharing with your friends on Facebook. ROSE does not collect any content-related information, e.g., pictures, links, messages on Timelines, chat messages, or the names of groups you attended. ROSE only collects data about the usage of a type of action, e.g. if you are commenting on a picture. In the analysis the study advisors are only able to see that you made use of an action. The study advisors only asses that you made use of a type of action, but does not see if you are commenting on a picture of a polar bear or if you are commenting on a picture showing a friend of yours who is at a party. If you like to record information on the content of an action in order to explain why you made use of a specific action, please use the ROSE comments or your diary.</p>"
      },
      issue5: {
        question: "How do I control which interaction data ROSE collected?",
        answer: "<p>You may easily check this by using the user interface (menu item &quot;interaction tracking&quot;). Moreover you may read which data was collected by ROSE, when you are transferring your data to the study advisors. Even though it is a compact text-based data format, you may easily check that no personal data is transmitted.</p>"
      },
      issue6: {
        question: "How can I be sure that ROSE makes my data anonymous?",
        answer: "<p>ROSE data does not contain any information which refers to the Facebook user who created this data. ROSE does not save any Facebook user names or pictures’ and videos’ URLs provided by users. Thus ROSE data does not differ from ethnographically elicited and anonymised data, such as interviews. Anyways, saving content-related information would no be very sufficient as it does no allow contextual analysis</p>"
      },
      issue7: {
        question: "May I review the source code to check previous declarations?",
        answer: "<p>Yes. ROSE is a free, open-source software under GPL-license (General Public License). You may review the source code and you may change and process it on the conditions of the GPL. In favor of needing assistance, please contact the study advisors.</p>"
      },
      issue8: {
        question: "May I use ROSE for personal purposes after the study ended?",
        answer: "<p>Yes. You may continue using ROSE and process it without hesitation as it does not send any information to the study advisors automatically. Thereto please note the GPL license’s conditions. However, after the study ended we are not able to endorse you by using the software, e.g. providing ROSE updates.</p>"
      }
    },

    // About Page
    about: {
      title: "About ROSE",
      subtitle: "Information about ROSE",
      description: "ROSE is a browser extension to support empirical Field studies by recording users' interactions with the social network Facebook for a limited period of time. Please consider the help page for further information on ROSE's functioning.",
      developedBy: "is developed by",

      address: {
        name: "Fraunhofer Institute for Secure Information Technology SIT",
        street: "Rheinstrasse 75",
        country: "Germany"
      },

      forQuestions: "For questions about ROSE feel free to contact",
      licenceNotice: "This program is free software;you can redistribute it and/or modify it under the terms of the GNU General Public License version as published by the Free Software Foundation;either version 3 of the License, or (at your option) any later version."
    },

    // Study Creator Page
    studyCreator: {
      title: 'Study Creator',
      subtitle: 'LALALALALALALa',

      roseComments: "ROSE Comments",
      roseCommentsDesc: "Check if the ROSE Comments function should be available",
      roseCommentsRating: "ROSE Comments Rating",
      roseCommentsRatingDesc: "Check if the ROSE Comments rating function should be available",
      salt: "Salt",
      saltDesc: "Whats the purpose of this settings?",
      hashLength: "Hash Length",
      hashLengthDesc: "Whats the purpose of this settings?",
      repositoryUrl: "Repository URL",
      repositoryUrlDesc: "Whats the purpose of this settings?",
      autoUpdate: "Automatically Update Observers from Repository",
      autoUpdateDesc: "Whats the purpose of this settings?",
      exportConfig: "Export Configuration",
      exportConfigDesc: "Export configuration to file",
      fingerprint: "Fingerabdruck",
      fingerprintDesc: "Whats the purpose of this settings?"
    }
  };
});
define("rose/locales/en/config", ["exports"], function (exports) {
  // Ember-I18n inclues configuration for common locales. Most users
  // can safely delete this file. Use it if you need to override behavior
  // for a locale or define behavior for a locale that Ember-I18n
  // doesn't know about.
  exports["default"] = {
    // rtl: [true|FALSE],
    //
    // pluralForm: function(count) {
    //   if (count === 0) { return 'zero'; }
    //   if (count === 1) { return 'one'; }
    //   if (count === 2) { return 'two'; }
    //   if (count < 5) { return 'few'; }
    //   if (count >= 5) { return 'many'; }
    //   return 'other';
    // }
  };
});
define("rose/locales/en/translations", ["exports"], function (exports) {
  exports["default"] = {
    // General
    and: "and",
    yes: "Yes",
    no: "No",
    on: "On",
    off: "Off",
    hourly: "Hourly",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",

    action: {
      save: "Save",
      cancel: "Cancel",
      edit: "Edit",
      hide: "Hide",
      unhide: "Unhide",
      "delete": "Delete",
      download: "Download",
      details: "Details",
      reset: "Reset",
      update: "Update",
      confirm: "Confirm"
    },

    // Sidebar Menu
    sidebarMenu: {
      data: "Data",
      dashboard: "Dashboard",
      diary: "Diary",
      backup: "Data Management",
      settings: "Settings",
      comments: "Study Surveys and Notes",
      interactions: "Interactions",
      extracts: "Extracts",
      networks: "Networks",
      more: "More",
      help: "Help",
      about: "About",
      extraFeatures: "Researcher Features",
      studyCreator: "Study Creator",
      debugLog: "Application Log"
    },

    wizard: {
      header: "Welcome to ROSE",
      description: "In this step we first need to configure ROSE to work properly.",
      configOptions: "Choose one of the following two options to configure ROSE before your first use.",
      defaultConfigHeader: "Use the default configuration",
      defaultConfigDescription: "I have no configuration file to customize ROSE.",
      defaultBtn: "Use the default configuration",
      fileConfigHeader: "Use a configuration file",
      fileConfigDescription: "I have a customized configuration file for initializing ROSE.",
      fileConfigBtn: "Load the configuration file",
      urlConfig: "Specifiy a URL to an ROSE repository..."
    },

    // Diary Page
    diary: {
      title: "Diary",
      subtitle: "Here you can take notes of everything that attracted your attention"
    },

    // Data Management aka Backup Page
    backup: {
      title: "Data Management",
      subtitle: "Clear, review, or download all data history recorded by ROSE.",
      resetData: "Clear history",
      resetDataLabel: "Remove all data collected by ROSE.",
      "export": "Export data",
      exportLabel: "Save and download the data history to a single file locally on your computer."
    },

    resetDataModal: {
      question: "Confirm removal of all collected data",
      warning: "Are you sure you want to delete all data collected? This action cannot be undone."
    },

    // Settings Page
    settings: {
      title: "Settings",
      subtitle: "Manage the configuration of ROSE.",
      language: "Language",
      languageLabel: "Choose your preferred language, or use the default language from the browser (“auto detect” option).",
      commentReminder: "Comment reminder",
      commentReminderLabel: "ROSE will occasionally display a message at the bottom of the screen to remind you to comment on your actions if the research study requires you to do so. You can deactivate this feature if it disturbs you.",
      extraFeatures: "Features for researchers and developers",
      extraFeaturesLabel: "ROSE has additional features for field researchers and ROSE developers. These features are not visible unless activated here.",
      resetRose: "Reset ROSE configuration",
      resetRoseLabel: "If you reset the configuration of ROSE, the initialization wizard will appear again. You can choose to either use the default configuration or load a specific study configuration file.",
      manualUpdate: "Manual configuration update",
      manualUpdateLabel: "Social media sites change their webpage design from time to time. ROSE requires an update to work properly when these changes occur. To trigger an update manually, press the “update” button.",
      autoUpdate: "Automatic configuration update",
      autoUpdateLabel: "For automatic updates to recent changes in social media sites, switch on the automatic update function.",
      autoUpdateInterval: "Automatic update interval",
      autoUpdateIntervalLabel: "ROSE checks for automatic configuration updates in the specified time interval."
    },

    resetConfigModal: {
      question: "Confirm resetting the configuration of ROSE",
      warning: "Are you sure you want to reset the configuration of ROSE. This action will bring you back to the configuration wizard. All collected data will remain unchanged."
    },

    // Comments Page
    comments: {
      title: "Study Surveys and Notes",
      subtitle: "All your survey responses or study notes.",

      you: "You",
      commentedOn: "commented on"
    },

    // Interactions Page
    interactions: {
      title: "Interactions",
      subtitle: "All your recent interactions on this social media site recorded by ROSE.",
      actionOn: "action on",
      action: "action"
    },

    // Extracts Settings Page
    extracts: {
      title: "Extracts",
      subtitle: "ROSE extracted these information"
    },

    // Help Page
    help: {
      title: "Help",
      subtitle: "Frequently asked questions about ROSE",

      issue1: {
        question: "Where does ROSE collect the data about my social media sites' usage and my comments from?",
        answer: "<p>ROSE collects data from and stores data in your web browser. There is no automatic transmission of data between ROSE and the social media sites, or between ROSE and the researchers of the study. ROSE will provide a pre-assembled option through which you can send your data to the researchers.</p><p>There is a disadvantage as a result of this privacy-aware design of ROSE. Since data is stored locally with no automatic uploading, it can get lost in the case of system errors on your computer, or in the case of accidental deletion of ROSE from your web browser. Data is irretrievable once it is lost.</p>"
      },
      issue2: {
        question: "Are my ROSE study comments visible to other study participants or my social media site friends?",
        answer: "<p>No, the comments you make through ROSE are invisible to other study participants or your social media site friends. For technical reasons, ROSE does not transmit data to the server of the social media sites or to the researchers of the study. ROSE does not receive data from any other source either. Though ROSE is integrated in your web browser and the social media sites interface, thus appearing like “real” social media site functions, it completely and exclusively functions in your web browser. There is no way for the social media sites to detect whether or not you are using ROSE.</p>"
      },
      issue3: {
        question: "What types of data are recorded by ROSE?",
        answer: "<p>ROSE records the following types of data:</p><ul><li>Date and time of interactions on social media sites, i.e., the time the study participant engages in an interaction. </li><li>Type of interaction, e.g., “liking content,” “viewing a profile,” “sharing content.”</li><li>Unique identifiers, eight-digit combinations of letters and numbers (e.g., \"2a2d6fc3\") that correspond to each story item (e.g., a picture, a status update) the study participant interacted with. With the identifiers, researchers can detect when multiple study participants interact with the same story item. But the researchers will not know the content of the item.</li><li>Privacy settings concerning interactions, e.g. whether a story item is visible for “Friends” only or for the public.</li><li>Diary entries.</li><li>ROSE study comments.</li><li>Privacy settings in general.</li></ul>"
      },
      issue4: {
        question: "Does ROSE collect the actual content I share with my friends on social media sites?",
        answer: "<p>No. ROSE does not collect any content information, such as pictures, links, or messages on Timelines; chat messages; or the name of groups you attended. ROSE only collects data about the usage of a type of interaction, e.g., whether you commented on a picture, or whether you engaged in a chat with a  friend. In the analysis, researchers are only able to see whether you engaged in an interaction, the timestamp, and the type of interaction. For example, researchers can see that you commented on a picture, but they will not know whether the picture is about a polar bear or friends at a party. If you would like to report information regarding the content of an interaction in order to explain why you made use of a specific action, please use the ROSE comments function or the diary function.</p>"
      },
      issue5: {
        question: "How do I control what types of interaction ROSE collect?",
        answer: "<p>You can easily check the types of interaction recorded from the ROSE user interface (menu item “Interactions”). When you export and share your data with the researchers, you can also view all data collected in the compact text-based data format. You will see from the exported data file that there is no personal data collected.</p>"
      },
      issue6: {
        question: "How can I be sure that ROSE makes my data anonymous?",
        answer: "<p>ROSE data does not contain any information identifying the social media site user who created the data. ROSE does not save any social media site user names, pictures, or videos provided by users. Thus, ROSE data is similar to anonymized data collected through other means, such as anonymous interviews. </p>"
      },
      issue7: {
        question: "May I review the source code to check previous declarations?",
        answer: "<p>Yes. ROSE is free, open-source software under GPL-license (General Public License). You may review the source code, change, or process it under the conditions of the GPL. Should you need assistance, please contact the project advisor. </p>"
      },
      issue8: {
        question: "May I use ROSE for personal purposes after the study ends?",
        answer: "<p>Yes. You may continue using ROSE for your own records, as it does not send any information to the researchers automatically. Please note the GPL license’s conditions. However, after the completion of the study, we will not be able to provide any assistance, such as providing ROSE updates.</p>"
      }
    },

    // About Page
    about: {
      title: "About ROSE",
      subtitle: "Information about ROSE",
      description: "ROSE is a browser extension to support empirical field studies by recording users' interactions with social media sites for a limited period of time. Please refer to the Help page for further information on the functions and use of ROSE.",
      developedBy: "ROSE is developed by",

      address: {
        name: "Fraunhofer Institute for Secure Information Technology SIT",
        street: "Rheinstrasse 75",
        country: "Germany"
      },

      forQuestions: "For questions about ROSE, feel free to contact project advisor:",
      licenceNotice: "This program is free software. You can redistribute it and/or modify it under the terms of the GNU General Public License (version 3 or above) as published by the Free Software Foundation."
    },

    // Study Creator Page
    studyCreator: {
      title: 'Study Creator',
      subtitle: 'With this page you can create a tailored configuration file for your study. You can distribute this configuration file to you study participants; by loading this file into their installations of ROSE participants can adapt their ROSE instances to the specific needs of your empirical study.',

      roseComments: "In-situ comments",
      roseCommentsDesc: "Check this if ROSE's in-situ comment function should be available to participants. Currently the in-situ comment function works only for Facebook.",
      roseCommentsRating: "Add in-situ rating option",
      roseCommentsRatingDesc: "Check this if the in-situ comment function should also ask for rating content.",
      salt: "Cryptographic salt for content identifiers",
      saltDesc: "ROSE records pseudonymous identifiers for user content that allow researchers to re-identify content without a need to reveal it. These identfiers are derived from user-entered content and a cryptographic salt. As a cryptographic salt you can enter any arbitray text string, for example \"ROSE123\" or whatever else you like. However, make sure that in case you investigate a group of participants all use the same salt in their ROSE configuration. Otherwise you can not correlate identifiers among participants afterwards.",
      hashLength: "Content identifier length",
      hashLengthDesc: "Here you can specify the length of the pseudonymous identifiers created by ROSE. You need to balance participants' privacy and the uniqueness of identifiers: the shorter the identifier the more secure they are; the longer the identifiers the more unique they are. Every digit adds a factor of 16 to the space of possible identifiers for your study. For example, setting the option to 4 allows for 16*16*16*16=65536 unique identifiers for your study. 5 is a good value if you are unsure how to use this option.",
      repositoryUrl: "URL of pattern repository",
      repositoryUrlDesc: "ROSE gets its patterns to match user interactions to specific interaction types from a pattern repository. Here you can enter the URL of this repository.",
      autoUpdate: "Automatically update patterns during study",
      autoUpdateDesc: "While the patterns are usually only pushed to ROSE when the configuration file is loaded into participants' instances of ROSE, it is also possible to continously update them while the study is running. This might be necessary for long-term studies, if the user interface of the investigated social media site changes.",
      exportConfig: "Export configuration file",
      exportConfigDesc: "Here you can export a configuration file with all the settings entered on this page. Your participants can load this file into their installations of ROSE.",
      fingerprint: "Pattern repository signing key fingerprint",
      fingerprintDesc: "For reasons of security, the patterns stored in the pattern repository need to be signed with a RSA private key. This signature is validated before ROSE loads any patterns. Please enter the fingerprint of the public key ROSE shall use to verify the digital signature.",
      optionalFeaturesHeader: "Optional features",
      privacyHeader: "Privacy settings",
      repositoryHeader: "Configure tracking package repository",
      configurationHeader: "Configure tracking",
      autoUpdateHeader: "Configure automatic tracking package updates",
      networks: "Websites to track",
      networksDesc: "Here you can enable or disable which websites shall be tracked by ROSE",
      extractors: "Available data extractors",
      observers: "Available interaction observers",
      enableAll: "Enable all available",
      disableAll: "Disable all available",
      forceSecureUpdate: "Force secure update",
      forceSecureUpdateDesc: "If turned on, update of the tracking package is only allowed from a trustworthy source. You need to provide the correct fingerprint for the signing key above.",
      updateInterval: "Interval to check for an updated tracking package",
      updateIntervalLabel: "Choose a time interval to check for tracking package updates",

      table: {
        enabled: "Status (on/off)",
        name: "Pattern name",
        version: "Current version",
        description: "Description",
        type: "Type"
      }
    },

    // Application Log
    debugLog: {
      title: "Application Log",
      subtitle: "This page shows all log messages thrown by ROSE application modules",
      date: "Timestamp",
      message: "Log message",
      module: "Module name"
    }
  };
});
define("rose/locales/languages", ["exports"], function (exports) {
  exports["default"] = [{ name: "Auto detect", code: "auto" }, { name: "English", code: "en" }, { name: "Deutsch", code: "de" }];
});
define('rose/models/comment', ['exports', 'ember-data'], function (exports, _emberData) {

  var model = _emberData['default'].Model.extend({
    text: _emberData['default'].attr('string'),
    createdAt: _emberData['default'].attr('string', { defaultValue: function defaultValue() {
        return new Date().toJSON();
      } }),
    checkbox: _emberData['default'].attr('array'),
    updatedAt: _emberData['default'].attr(),
    isPrivate: _emberData['default'].attr('boolean'),
    rating: _emberData['default'].attr('array'),
    contentId: _emberData['default'].attr('string'),
    type: _emberData['default'].attr('string'),
    network: _emberData['default'].attr()
  });

  exports['default'] = model;
});
define('rose/models/diary-entry', ['exports', 'ember-data'], function (exports, _emberData) {

  var model = _emberData['default'].Model.extend({
    text: _emberData['default'].attr('string'),
    createdAt: _emberData['default'].attr('string', { defaultValue: function defaultValue() {
        return new Date().toJSON();
      } }),
    updatedAt: _emberData['default'].attr(),
    isPrivate: _emberData['default'].attr('boolean', { defaultValue: false })
  });

  exports['default'] = model;
});
define('rose/models/extract', ['exports', 'ember-data'], function (exports, _emberData) {
  exports['default'] = _emberData['default'].Model.extend({
    createdAt: _emberData['default'].attr('string'),
    origin: _emberData['default'].attr(),
    fields: _emberData['default'].attr()
  });
});
define('rose/models/extractor', ['exports', 'ember-data'], function (exports, _emberData) {
  exports['default'] = _emberData['default'].Model.extend({
    network: _emberData['default'].attr()
  });
});
define('rose/models/interaction', ['exports', 'ember-data'], function (exports, _emberData) {
  exports['default'] = _emberData['default'].Model.extend({
    createdAt: _emberData['default'].attr('string'),
    origin: _emberData['default'].attr(),
    isPrivate: _emberData['default'].attr('boolean')
  });
});
define('rose/models/network', ['exports', 'ember-data'], function (exports, _emberData) {
  exports['default'] = _emberData['default'].Model.extend({
    name: _emberData['default'].attr('string'),
    descriptiveName: _emberData['default'].attr('string'),
    identifier: _emberData['default'].attr('string'),
    isEnabled: _emberData['default'].attr('boolean')
  });
});
define('rose/models/observer', ['exports', 'ember-data'], function (exports, _emberData) {
  exports['default'] = _emberData['default'].Model.extend({});
});
define('rose/models/study-creator-setting', ['exports', 'ember-data'], function (exports, _emberData) {
  exports['default'] = _emberData['default'].Model.extend({
    roseCommentsIsEnabled: _emberData['default'].attr('boolean'),
    roseCommentsRatingIsEnabled: _emberData['default'].attr('boolean'),
    salt: _emberData['default'].attr('string'),
    hashLength: _emberData['default'].attr('number', { defaultValue: 8 }),
    repositoryURL: _emberData['default'].attr('string'),
    autoUpdateIsEnabled: _emberData['default'].attr('boolean'),
    secureUpdateIsEnabled: _emberData['default'].attr('boolean'),
    fileName: _emberData['default'].attr('string', { defaultValue: 'rose-study-configuration.txt' }),
    networks: _emberData['default'].hasMany('network', { async: true }),
    fingerprint: _emberData['default'].attr('string'),
    updateInterval: _emberData['default'].attr('number')
  });
});
define('rose/models/system-config', ['exports', 'ember-data'], function (exports, _emberData) {
  exports['default'] = _emberData['default'].Model.extend({
    autoUpdateIsEnabled: _emberData['default'].attr('boolean'),
    roseCommentsIsEnabled: _emberData['default'].attr('boolean'),
    roseCommentsRatingIsEnabled: _emberData['default'].attr('boolean'),
    salt: _emberData['default'].attr('string'),
    hashLength: _emberData['default'].attr('number'),
    repositoryURL: _emberData['default'].attr('string'),
    updateInterval: _emberData['default'].attr('number'),
    fingerprint: _emberData['default'].attr('string'),
    fileName: _emberData['default'].attr('string'),
    timestamp: _emberData['default'].attr('number')
  });
});
define('rose/models/user-setting', ['exports', 'ember-data'], function (exports, _emberData) {
  exports['default'] = _emberData['default'].Model.extend({
    commentReminderIsEnabled: _emberData['default'].attr('boolean'),
    developerModeIsEnabled: _emberData['default'].attr('boolean'),
    currentLanguage: _emberData['default'].attr('string', { defaultValue: 'en' }),
    firstRun: _emberData['default'].attr('boolean', { defaultValue: 'true' })
  });
});
define('rose/pods/components/diary-entry/component', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Component.extend({
    classNames: ['comment', 'diary-entry'],

    actions: {
      hide: function hide() {
        this.set('model.isPrivate', true);
        this.get('model').save();
      },
      unhide: function unhide() {
        this.set('model.isPrivate', false);
        this.get('model').save();
      },
      'delete': function _delete() {
        this.get('model').destroyRecord();
      },
      edit: function edit() {
        this.set('isEditable', true);
      },
      save: function save() {
        this.set('model.updatedAt', new Date().toJSON());
        this.get('model').save();
        this.set('isEditable', false);
      },
      cancel: function cancel() {
        this.get('model').rollbackAttributes();
        this.set('isEditable', false);
      }
    }
  });
});
define("rose/pods/components/diary-entry/template", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 9,
              "column": 2
            },
            "end": {
              "line": 13,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/diary-entry/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "ui form");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 1, 1);
          return morphs;
        },
        statements: [["inline", "textarea", [], ["value", ["subexpr", "@mut", [["get", "model.text", ["loc", [null, [11, 23], [11, 33]]]]], [], []]], ["loc", [null, [11, 6], [11, 35]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 13,
              "column": 2
            },
            "end": {
              "line": 15,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/diary-entry/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["content", "model.text", ["loc", [null, [14, 4], [14, 18]]]]],
        locals: [],
        templates: []
      };
    })();
    var child2 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 18,
              "column": 2
            },
            "end": {
              "line": 25,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/diary-entry/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element3 = dom.childAt(fragment, [1]);
          var element4 = dom.childAt(fragment, [3]);
          var morphs = new Array(4);
          morphs[0] = dom.createElementMorph(element3);
          morphs[1] = dom.createMorphAt(element3, 1, 1);
          morphs[2] = dom.createElementMorph(element4);
          morphs[3] = dom.createMorphAt(element4, 1, 1);
          return morphs;
        },
        statements: [["element", "action", ["save"], [], ["loc", [null, [19, 7], [19, 24]]]], ["inline", "t", ["action.save"], [], ["loc", [null, [20, 6], [20, 25]]]], ["element", "action", ["cancel"], [], ["loc", [null, [22, 7], [22, 26]]]], ["inline", "t", ["action.cancel"], [], ["loc", [null, [23, 6], [23, 27]]]]],
        locals: [],
        templates: []
      };
    })();
    var child3 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 25,
              "column": 2
            },
            "end": {
              "line": 29,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/diary-entry/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element2 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element2);
          morphs[1] = dom.createMorphAt(element2, 1, 1);
          return morphs;
        },
        statements: [["element", "action", ["edit"], [], ["loc", [null, [26, 7], [26, 24]]]], ["inline", "t", ["action.edit"], [], ["loc", [null, [27, 6], [27, 25]]]]],
        locals: [],
        templates: []
      };
    })();
    var child4 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 30,
              "column": 2
            },
            "end": {
              "line": 34,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/diary-entry/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element1 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element1);
          morphs[1] = dom.createMorphAt(element1, 1, 1);
          return morphs;
        },
        statements: [["element", "action", ["unhide"], [], ["loc", [null, [31, 7], [31, 26]]]], ["inline", "t", ["action.unhide"], [], ["loc", [null, [32, 6], [32, 27]]]]],
        locals: [],
        templates: []
      };
    })();
    var child5 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 34,
              "column": 2
            },
            "end": {
              "line": 38,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/diary-entry/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element0);
          morphs[1] = dom.createMorphAt(element0, 1, 1);
          return morphs;
        },
        statements: [["element", "action", ["hide"], [], ["loc", [null, [35, 7], [35, 24]]]], ["inline", "t", ["action.hide"], [], ["loc", [null, [36, 6], [36, 25]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 44,
            "column": 0
          }
        },
        "moduleName": "rose/pods/components/diary-entry/template.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("a");
        dom.setAttribute(el1, "class", "avatar");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "circular file text outline icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "content");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "metadata");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("span");
        dom.setAttribute(el3, "class", "date");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "text disabled");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "actions");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("a");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element5 = dom.childAt(fragment, [2]);
        var element6 = dom.childAt(element5, [5]);
        var element7 = dom.childAt(element6, [4]);
        var morphs = new Array(6);
        morphs[0] = dom.createMorphAt(dom.childAt(element5, [1, 1]), 0, 0);
        morphs[1] = dom.createMorphAt(dom.childAt(element5, [3]), 1, 1);
        morphs[2] = dom.createMorphAt(element6, 1, 1);
        morphs[3] = dom.createMorphAt(element6, 2, 2);
        morphs[4] = dom.createElementMorph(element7);
        morphs[5] = dom.createMorphAt(element7, 1, 1);
        return morphs;
      },
      statements: [["inline", "moment-format", [["get", "model.createdAt", ["loc", [null, [6, 39], [6, 54]]]]], [], ["loc", [null, [6, 23], [6, 56]]]], ["block", "liquid-if", [["get", "isEditable", ["loc", [null, [9, 15], [9, 25]]]]], [], 0, 1, ["loc", [null, [9, 2], [15, 16]]]], ["block", "if", [["get", "isEditable", ["loc", [null, [18, 8], [18, 18]]]]], [], 2, 3, ["loc", [null, [18, 2], [29, 9]]]], ["block", "if", [["get", "model.isPrivate", ["loc", [null, [30, 8], [30, 23]]]]], [], 4, 5, ["loc", [null, [30, 2], [38, 9]]]], ["element", "action", ["delete"], [], ["loc", [null, [39, 7], [39, 26]]]], ["inline", "t", ["action.delete"], [], ["loc", [null, [40, 6], [40, 27]]]]],
      locals: [],
      templates: [child0, child1, child2, child3, child4, child5]
    };
  })());
});
define('rose/pods/components/file-input/component', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].TextField.extend({
    type: 'file',

    change: function change() {
      var _this = this;

      var input = event.target;
      if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
          var data = e.target.result;
          _this.sendAction('onread', data);
        };
        reader.readAsText(input.files[0]);
      }
    }
  });
});
define("rose/pods/components/file-input/template", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "rose/pods/components/file-input/template.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [["content", "yield", ["loc", [null, [1, 0], [1, 9]]]]],
      locals: [],
      templates: []
    };
  })());
});
define('rose/pods/components/file-input-button/component', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Component.extend({
    actions: {
      openFileChooser: function openFileChooser() {
        this.$('input').click();
      },

      onread: function onread(data) {
        this.sendAction('onread', data);
      }
    }
  });
});
define("rose/pods/components/file-input-button/template", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 5,
            "column": 0
          }
        },
        "moduleName": "rose/pods/components/file-input-button/template.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("button");
        dom.setAttribute(el1, "class", "ui primary bottom attached button");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0]);
        var morphs = new Array(3);
        morphs[0] = dom.createElementMorph(element0);
        morphs[1] = dom.createMorphAt(element0, 1, 1);
        morphs[2] = dom.createMorphAt(fragment, 2, 2, contextualElement);
        return morphs;
      },
      statements: [["element", "action", ["openFileChooser"], [], ["loc", [null, [1, 50], [1, 78]]]], ["content", "yield", ["loc", [null, [2, 2], [2, 11]]]], ["inline", "file-input", [], ["class", "hidden", "onread", "onread"], ["loc", [null, [4, 0], [4, 45]]]]],
      locals: [],
      templates: []
    };
  })());
});
define('rose/pods/components/installation-wizard/component', ['exports', 'ember', 'ic-ajax'], function (exports, _ember, _icAjax) {
  exports['default'] = _ember['default'].Component.extend({
    actions: {
      cancel: function cancel() {
        this.sendAction('cancel');
      },

      saveConfig: function saveConfig(data) {
        this.sendAction('onsuccess', data);
      },

      openFileChooser: function openFileChooser() {
        this.$('input.hidden').click();
      },

      onread: function onread(data) {
        this.sendAction('onsuccess', data);
      },

      selectDefaultConfig: function selectDefaultConfig() {
        var _this = this;

        var src = kango.io.getResourceUrl('res/defaults/rose-configuration.json');
        (0, _icAjax.request)(src).then(function (json) {
          _this.sendAction('onsuccess', json);
        });
      }
    }
  });
});
define("rose/pods/components/installation-wizard/template", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 43,
            "column": 0
          }
        },
        "moduleName": "rose/pods/components/installation-wizard/template.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui two column centered grid");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "column");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "ui segment form");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("h2");
        dom.setAttribute(el4, "class", "ui dividing header");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("i");
        dom.setAttribute(el5, "class", "download icon");
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5, "class", "content");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createComment("");
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6, "class", "sub header");
        var el7 = dom.createComment("");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("div");
        dom.setAttribute(el4, "class", "ui two cards");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5, "class", "card");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6, "class", "content");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7, "class", "header");
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7, "class", "description");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("button");
        dom.setAttribute(el6, "class", "ui primary bottom attached button");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createComment("");
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5, "class", "card");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6, "class", "content");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7, "class", "header");
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7, "class", "description");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("button");
        dom.setAttribute(el6, "class", "ui primary bottom attached button");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("i");
        dom.setAttribute(el7, "class", "add icon");
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createComment("");
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createComment("");
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0, 1, 1]);
        var element1 = dom.childAt(element0, [1, 3]);
        var element2 = dom.childAt(element0, [3]);
        var element3 = dom.childAt(element2, [1]);
        var element4 = dom.childAt(element3, [1]);
        var element5 = dom.childAt(element3, [3]);
        var element6 = dom.childAt(element2, [3]);
        var element7 = dom.childAt(element6, [1]);
        var element8 = dom.childAt(element6, [3]);
        var morphs = new Array(11);
        morphs[0] = dom.createMorphAt(element1, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element1, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(dom.childAt(element4, [1]), 0, 0);
        morphs[3] = dom.createMorphAt(dom.childAt(element4, [3]), 1, 1);
        morphs[4] = dom.createElementMorph(element5);
        morphs[5] = dom.createMorphAt(element5, 1, 1);
        morphs[6] = dom.createMorphAt(dom.childAt(element7, [1]), 0, 0);
        morphs[7] = dom.createMorphAt(dom.childAt(element7, [3]), 1, 1);
        morphs[8] = dom.createElementMorph(element8);
        morphs[9] = dom.createMorphAt(element8, 3, 3);
        morphs[10] = dom.createMorphAt(element6, 5, 5);
        return morphs;
      },
      statements: [["inline", "t", ["wizard.header"], [], ["loc", [null, [7, 10], [7, 31]]]], ["inline", "t", ["wizard.description"], [], ["loc", [null, [8, 34], [8, 60]]]], ["inline", "t", ["wizard.defaultConfigHeader"], [], ["loc", [null, [15, 32], [15, 66]]]], ["inline", "t", ["wizard.defaultConfigDescription"], [], ["loc", [null, [17, 14], [17, 53]]]], ["element", "action", ["selectDefaultConfig"], [], ["loc", [null, [21, 18], [21, 50]]]], ["inline", "t", ["wizard.defaultBtn"], [], ["loc", [null, [22, 12], [22, 37]]]], ["inline", "t", ["wizard.fileConfigHeader"], [], ["loc", [null, [27, 32], [27, 63]]]], ["inline", "t", ["wizard.fileConfigDescription"], [], ["loc", [null, [29, 14], [29, 50]]]], ["element", "action", ["openFileChooser"], [], ["loc", [null, [33, 18], [33, 46]]]], ["inline", "t", ["wizard.fileConfigBtn"], [], ["loc", [null, [35, 12], [35, 40]]]], ["inline", "file-input", [], ["class", "hidden", "onread", "onread"], ["loc", [null, [37, 10], [37, 55]]]]],
      locals: [],
      templates: []
    };
  })());
});
define('rose/pods/components/no-data-message/component', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Component.extend({});
});
define("rose/pods/components/no-data-message/template", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 8,
            "column": 6
          }
        },
        "moduleName": "rose/pods/components/no-data-message/template.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui icon message");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "open folder outline icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "header");
        var el4 = dom.createTextNode("\n      There is no data to list here, yet.\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes() {
        return [];
      },
      statements: [],
      locals: [],
      templates: []
    };
  })());
});
define("rose/pods/components/page-numbers/template", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 2,
              "column": 4
            },
            "end": {
              "line": 6,
              "column": 4
            }
          },
          "moduleName": "rose/pods/components/page-numbers/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("        ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          dom.setAttribute(el1, "class", "icon item");
          var el2 = dom.createTextNode("\n            ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("i");
          dom.setAttribute(el2, "class", "left arrow icon");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element1 = dom.childAt(fragment, [1]);
          var morphs = new Array(1);
          morphs[0] = dom.createElementMorph(element1);
          return morphs;
        },
        statements: [["element", "action", ["incrementPage", -1], [], ["loc", [null, [3, 29], [3, 58]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 6,
              "column": 4
            },
            "end": {
              "line": 10,
              "column": 4
            }
          },
          "moduleName": "rose/pods/components/page-numbers/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("        ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          dom.setAttribute(el1, "class", "icon item disabled");
          var el2 = dom.createTextNode("\n            ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("i");
          dom.setAttribute(el2, "class", "left arrow icon");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes() {
          return [];
        },
        statements: [],
        locals: [],
        templates: []
      };
    })();
    var child2 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 13,
                "column": 8
              },
              "end": {
                "line": 15,
                "column": 8
              }
            },
            "moduleName": "rose/pods/components/page-numbers/template.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("            ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1, "class", "disabled item");
            var el2 = dom.createTextNode("...");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();
      var child1 = (function () {
        var child0 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 17,
                  "column": 12
                },
                "end": {
                  "line": 19,
                  "column": 12
                }
              },
              "moduleName": "rose/pods/components/page-numbers/template.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("                ");
              dom.appendChild(el0, el1);
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
              return morphs;
            },
            statements: [["content", "item.page", ["loc", [null, [18, 16], [18, 29]]]]],
            locals: [],
            templates: []
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 16,
                "column": 8
              },
              "end": {
                "line": 20,
                "column": 8
              }
            },
            "moduleName": "rose/pods/components/page-numbers/template.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["block", "link-to", [["subexpr", "query-params", [], ["page", ["get", "item.page", ["loc", [null, [17, 42], [17, 51]]]]], ["loc", [null, [17, 23], [17, 52]]]]], ["class", "item active"], 0, null, ["loc", [null, [17, 12], [19, 24]]]]],
          locals: [],
          templates: [child0]
        };
      })();
      var child2 = (function () {
        var child0 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 21,
                  "column": 12
                },
                "end": {
                  "line": 23,
                  "column": 12
                }
              },
              "moduleName": "rose/pods/components/page-numbers/template.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("                ");
              dom.appendChild(el0, el1);
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
              return morphs;
            },
            statements: [["content", "item.page", ["loc", [null, [22, 16], [22, 29]]]]],
            locals: [],
            templates: []
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 20,
                "column": 8
              },
              "end": {
                "line": 24,
                "column": 8
              }
            },
            "moduleName": "rose/pods/components/page-numbers/template.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["block", "link-to", [["subexpr", "query-params", [], ["page", ["get", "item.page", ["loc", [null, [21, 42], [21, 51]]]]], ["loc", [null, [21, 23], [21, 52]]]]], ["class", "item"], 0, null, ["loc", [null, [21, 12], [23, 24]]]]],
          locals: [],
          templates: [child0]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 12,
              "column": 4
            },
            "end": {
              "line": 25,
              "column": 4
            }
          },
          "moduleName": "rose/pods/components/page-numbers/template.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(2);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          morphs[1] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "if", [["get", "item.dots", ["loc", [null, [13, 14], [13, 23]]]]], [], 0, null, ["loc", [null, [13, 8], [15, 15]]]], ["block", "if", [["get", "item.current", ["loc", [null, [16, 14], [16, 26]]]]], [], 1, 2, ["loc", [null, [16, 8], [24, 15]]]]],
        locals: ["item"],
        templates: [child0, child1, child2]
      };
    })();
    var child3 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 27,
              "column": 4
            },
            "end": {
              "line": 31,
              "column": 4
            }
          },
          "moduleName": "rose/pods/components/page-numbers/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          dom.setAttribute(el1, "class", "icon item");
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("i");
          dom.setAttribute(el2, "class", "right arrow icon");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [1]);
          var morphs = new Array(1);
          morphs[0] = dom.createElementMorph(element0);
          return morphs;
        },
        statements: [["element", "action", ["incrementPage", 1], [], ["loc", [null, [28, 25], [28, 53]]]]],
        locals: [],
        templates: []
      };
    })();
    var child4 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 31,
              "column": 4
            },
            "end": {
              "line": 35,
              "column": 4
            }
          },
          "moduleName": "rose/pods/components/page-numbers/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          dom.setAttribute(el1, "class", "icon item disabled");
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("i");
          dom.setAttribute(el2, "class", "right arrow icon");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes() {
          return [];
        },
        statements: [],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 37,
            "column": 0
          }
        },
        "moduleName": "rose/pods/components/page-numbers/template.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui pagination menu");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element2 = dom.childAt(fragment, [0]);
        var morphs = new Array(3);
        morphs[0] = dom.createMorphAt(element2, 1, 1);
        morphs[1] = dom.createMorphAt(element2, 3, 3);
        morphs[2] = dom.createMorphAt(element2, 5, 5);
        return morphs;
      },
      statements: [["block", "if", [["get", "canStepBackward", ["loc", [null, [2, 10], [2, 25]]]]], [], 0, 1, ["loc", [null, [2, 4], [10, 11]]]], ["block", "each", [["get", "pageItems", ["loc", [null, [12, 12], [12, 21]]]]], [], 2, null, ["loc", [null, [12, 4], [25, 13]]]], ["block", "if", [["get", "canStepForward", ["loc", [null, [27, 10], [27, 24]]]]], [], 3, 4, ["loc", [null, [27, 4], [35, 11]]]]],
      locals: [],
      templates: [child0, child1, child2, child3, child4]
    };
  })());
});
define('rose/pods/components/rose-comment/component', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Component.extend({
    isEditable: false,
    classNames: ['comment'],

    previousActivity: _ember['default'].computed('model.checkbox', function () {
      var boxes = this.get('model.checkbox') || [];

      if (boxes.length) {
        if (boxes[0]) return 'Schoolwork offline';
        if (boxes[1]) return 'Schoolwork on the computer';
        if (boxes[2]) return 'Non-work activities on the computer';
        if (boxes[3]) return 'Non-work activities offline';
        if (boxes[4]) return 'Not doing anything in particular';
      }

      return 'Unkown';
    }),

    viewport: _ember['default'].computed('model.checkbox', function () {
      var boxes = this.get('model.checkbox') || [];

      if (boxes.length) {
        if (boxes[0]) return 'Newsfeed';
        if (boxes[1]) return 'Personal profile';
        if (boxes[2]) return 'Public page';
        if (boxes[3]) return 'Group page';
      }

      return 'Unkown';
    }),

    interested: _ember['default'].computed('model.checkbox', function () {
      var boxes = this.get('model.checkbox') || [];

      if (boxes.length) {
        if (boxes[4]) return 'Yes';
        if (boxes[5]) return 'No';
      }

      return 'Unkown';
    }),

    actions: {
      hide: function hide() {
        this.set('model.isPrivate', true);
        this.get('model').save();
      },
      unhide: function unhide() {
        this.set('model.isPrivate', false);
        this.get('model').save();
      },
      'delete': function _delete() {
        this.get('model').destroyRecord();
      },
      edit: function edit() {
        this.set('isEditable', true);
      },
      save: function save() {
        this.set('model.updatedAt', new Date().toJSON());
        this.get('model').save();
        this.set('isEditable', false);
      },
      cancel: function cancel() {
        this.get('model').rollbackAttributes();
        this.set('isEditable', false);
      }
    }
  });
});
define("rose/pods/components/rose-comment/template", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 6,
              "column": 4
            },
            "end": {
              "line": 8,
              "column": 4
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("strong");
          var el2 = dom.createTextNode("posting: ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 1, 1);
          return morphs;
        },
        statements: [["content", "model.contentId", ["loc", [null, [7, 23], [7, 42]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 8,
              "column": 4
            },
            "end": {
              "line": 10,
              "column": 4
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("strong");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 0, 0);
          return morphs;
        },
        statements: [["content", "model.type", ["loc", [null, [9, 14], [9, 28]]]]],
        locals: [],
        templates: []
      };
    })();
    var child2 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 13,
              "column": 4
            },
            "end": {
              "line": 18,
              "column": 4
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "rating");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("i");
          dom.setAttribute(el2, "class", "star icon");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 3, 3);
          return morphs;
        },
        statements: [["content", "value", ["loc", [null, [16, 6], [16, 15]]]]],
        locals: ["value"],
        templates: []
      };
    })();
    var child3 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 21,
              "column": 2
            },
            "end": {
              "line": 25,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "ui form");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 1, 1);
          return morphs;
        },
        statements: [["inline", "textarea", [], ["value", ["subexpr", "@mut", [["get", "model.text", ["loc", [null, [23, 23], [23, 33]]]]], [], []]], ["loc", [null, [23, 6], [23, 35]]]]],
        locals: [],
        templates: []
      };
    })();
    var child4 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 26,
                "column": 4
              },
              "end": {
                "line": 28,
                "column": 4
              }
            },
            "moduleName": "rose/pods/components/rose-comment/template.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("    ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1, "class", "ui segment");
            var el2 = dom.createElement("pre");
            var el3 = dom.createComment("");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1, 0]), 0, 0);
            return morphs;
          },
          statements: [["content", "model.text", ["loc", [null, [27, 33], [27, 47]]]]],
          locals: [],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 25,
              "column": 2
            },
            "end": {
              "line": 29,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "if", [["get", "model.text", ["loc", [null, [26, 10], [26, 20]]]]], [], 0, null, ["loc", [null, [26, 4], [28, 11]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    var child5 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 30,
              "column": 2
            },
            "end": {
              "line": 32,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  Viewport: ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("strong");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode(" - Interested: ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("strong");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(2);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 0, 0);
          morphs[1] = dom.createMorphAt(dom.childAt(fragment, [3]), 0, 0);
          return morphs;
        },
        statements: [["content", "viewport", ["loc", [null, [31, 20], [31, 32]]]], ["content", "interested", ["loc", [null, [31, 64], [31, 78]]]]],
        locals: [],
        templates: []
      };
    })();
    var child6 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 33,
              "column": 2
            },
            "end": {
              "line": 35,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  Previous activity: ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("strong");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 0, 0);
          return morphs;
        },
        statements: [["content", "previousActivity", ["loc", [null, [34, 29], [34, 49]]]]],
        locals: [],
        templates: []
      };
    })();
    var child7 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 38,
              "column": 2
            },
            "end": {
              "line": 45,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element3 = dom.childAt(fragment, [1]);
          var element4 = dom.childAt(fragment, [3]);
          var morphs = new Array(4);
          morphs[0] = dom.createElementMorph(element3);
          morphs[1] = dom.createMorphAt(element3, 1, 1);
          morphs[2] = dom.createElementMorph(element4);
          morphs[3] = dom.createMorphAt(element4, 1, 1);
          return morphs;
        },
        statements: [["element", "action", ["save"], [], ["loc", [null, [39, 7], [39, 24]]]], ["inline", "t", ["action.save"], [], ["loc", [null, [40, 6], [40, 25]]]], ["element", "action", ["cancel"], [], ["loc", [null, [42, 7], [42, 26]]]], ["inline", "t", ["action.cancel"], [], ["loc", [null, [43, 6], [43, 27]]]]],
        locals: [],
        templates: []
      };
    })();
    var child8 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 45,
              "column": 2
            },
            "end": {
              "line": 49,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element2 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element2);
          morphs[1] = dom.createMorphAt(element2, 1, 1);
          return morphs;
        },
        statements: [["element", "action", ["edit"], [], ["loc", [null, [46, 7], [46, 24]]]], ["inline", "t", ["action.edit"], [], ["loc", [null, [47, 6], [47, 25]]]]],
        locals: [],
        templates: []
      };
    })();
    var child9 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 50,
              "column": 2
            },
            "end": {
              "line": 54,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element1 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element1);
          morphs[1] = dom.createMorphAt(element1, 1, 1);
          return morphs;
        },
        statements: [["element", "action", ["unhide"], [], ["loc", [null, [51, 7], [51, 26]]]], ["inline", "t", ["action.unhide"], [], ["loc", [null, [52, 6], [52, 27]]]]],
        locals: [],
        templates: []
      };
    })();
    var child10 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 54,
              "column": 2
            },
            "end": {
              "line": 58,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-comment/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element0);
          morphs[1] = dom.createMorphAt(element0, 1, 1);
          return morphs;
        },
        statements: [["element", "action", ["hide"], [], ["loc", [null, [55, 7], [55, 24]]]], ["inline", "t", ["action.hide"], [], ["loc", [null, [56, 6], [56, 25]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 64,
            "column": 0
          }
        },
        "moduleName": "rose/pods/components/rose-comment/template.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("a");
        dom.setAttribute(el1, "class", "avatar");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "circular comment icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "content");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("a");
        dom.setAttribute(el2, "class", "author");
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode(" ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "metadata");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("span");
        dom.setAttribute(el3, "class", "date");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "text");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "actions");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("a");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element5 = dom.childAt(fragment, [2]);
        var element6 = dom.childAt(element5, [7]);
        var element7 = dom.childAt(element5, [9]);
        var element8 = dom.childAt(element5, [11]);
        var element9 = dom.childAt(element8, [4]);
        var morphs = new Array(12);
        morphs[0] = dom.createMorphAt(dom.childAt(element5, [1]), 0, 0);
        morphs[1] = dom.createMorphAt(element5, 3, 3);
        morphs[2] = dom.createMorphAt(element5, 5, 5);
        morphs[3] = dom.createMorphAt(dom.childAt(element6, [1]), 0, 0);
        morphs[4] = dom.createMorphAt(element6, 3, 3);
        morphs[5] = dom.createMorphAt(element7, 1, 1);
        morphs[6] = dom.createMorphAt(element7, 2, 2);
        morphs[7] = dom.createMorphAt(element7, 3, 3);
        morphs[8] = dom.createMorphAt(element8, 1, 1);
        morphs[9] = dom.createMorphAt(element8, 2, 2);
        morphs[10] = dom.createElementMorph(element9);
        morphs[11] = dom.createMorphAt(element9, 1, 1);
        return morphs;
      },
      statements: [["inline", "t", ["comments.you"], [], ["loc", [null, [5, 20], [5, 40]]]], ["inline", "t", ["comments.commentedOn"], [], ["loc", [null, [5, 45], [5, 73]]]], ["block", "if", [["subexpr", "eq", [["get", "model.type", ["loc", [null, [6, 14], [6, 24]]]], "post"], [], ["loc", [null, [6, 10], [6, 32]]]]], [], 0, 1, ["loc", [null, [6, 4], [10, 11]]]], ["inline", "moment-format", [["get", "model.createdAt", ["loc", [null, [12, 39], [12, 54]]]]], [], ["loc", [null, [12, 23], [12, 56]]]], ["block", "each", [["get", "model.rating", ["loc", [null, [13, 12], [13, 24]]]]], [], 2, null, ["loc", [null, [13, 4], [18, 13]]]], ["block", "liquid-if", [["get", "isEditable", ["loc", [null, [21, 15], [21, 25]]]]], [], 3, 4, ["loc", [null, [21, 2], [29, 16]]]], ["block", "if", [["subexpr", "eq", [["get", "model.type", ["loc", [null, [30, 12], [30, 22]]]], "post"], [], ["loc", [null, [30, 8], [30, 30]]]]], [], 5, null, ["loc", [null, [30, 2], [32, 9]]]], ["block", "if", [["subexpr", "eq", [["get", "model.type", ["loc", [null, [33, 12], [33, 22]]]], "engage"], [], ["loc", [null, [33, 8], [33, 32]]]]], [], 6, null, ["loc", [null, [33, 2], [35, 9]]]], ["block", "if", [["get", "isEditable", ["loc", [null, [38, 8], [38, 18]]]]], [], 7, 8, ["loc", [null, [38, 2], [49, 9]]]], ["block", "if", [["get", "model.isPrivate", ["loc", [null, [50, 8], [50, 23]]]]], [], 9, 10, ["loc", [null, [50, 2], [58, 9]]]], ["element", "action", ["delete"], [], ["loc", [null, [59, 7], [59, 26]]]], ["inline", "t", ["action.delete"], [], ["loc", [null, [60, 6], [60, 27]]]]],
      locals: [],
      templates: [child0, child1, child2, child3, child4, child5, child6, child7, child8, child9, child10]
    };
  })());
});
define('rose/pods/components/rose-extract/component', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Component.extend({
    classNames: ['comment'],
    showDetails: false,

    jsonData: (function () {
      return JSON.stringify(this.get('model'), null, 2);
    }).property('model'),

    actions: {
      toggleDetails: function toggleDetails() {
        this.toggleProperty('showDetails');
      },
      hide: function hide() {
        this.set('model.isPrivate', true);
        this.get('model').save();
      },
      unhide: function unhide() {
        this.set('model.isPrivate', false);
        this.get('model').save();
      },
      'delete': function _delete() {
        this.get('model').destroyRecord();
      }
    }
  });
});
define("rose/pods/components/rose-extract/template", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 10,
              "column": 2
            },
            "end": {
              "line": 14,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-extract/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "ui segment");
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("pre");
          var el3 = dom.createElement("code");
          var el4 = dom.createComment("");
          dom.appendChild(el3, el4);
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1, 1, 0]), 0, 0);
          return morphs;
        },
        statements: [["content", "jsonData", ["loc", [null, [12, 15], [12, 27]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 18,
              "column": 2
            },
            "end": {
              "line": 20,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-extract/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element1 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element1);
          morphs[1] = dom.createMorphAt(element1, 0, 0);
          return morphs;
        },
        statements: [["element", "action", ["unhide"], [], ["loc", [null, [19, 7], [19, 26]]]], ["inline", "t", ["action.unhide"], [], ["loc", [null, [19, 27], [19, 48]]]]],
        locals: [],
        templates: []
      };
    })();
    var child2 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 20,
              "column": 2
            },
            "end": {
              "line": 22,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-extract/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element0);
          morphs[1] = dom.createMorphAt(element0, 0, 0);
          return morphs;
        },
        statements: [["element", "action", ["hide"], [], ["loc", [null, [21, 7], [21, 24]]]], ["inline", "t", ["action.hide"], [], ["loc", [null, [21, 25], [21, 44]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 26,
            "column": 0
          }
        },
        "moduleName": "rose/pods/components/rose-extract/template.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("a");
        dom.setAttribute(el1, "class", "avatar");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "circular eyedropper icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "content");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("a");
        dom.setAttribute(el2, "class", "author");
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "metadata");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("span");
        dom.setAttribute(el3, "class", "date");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "text");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "actions");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("a");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("a");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element2 = dom.childAt(fragment, [2]);
        var element3 = dom.childAt(element2, [7]);
        var element4 = dom.childAt(element3, [1]);
        var element5 = dom.childAt(element3, [5]);
        var morphs = new Array(8);
        morphs[0] = dom.createMorphAt(dom.childAt(element2, [1]), 0, 0);
        morphs[1] = dom.createMorphAt(dom.childAt(element2, [3, 1]), 0, 0);
        morphs[2] = dom.createMorphAt(dom.childAt(element2, [5]), 1, 1);
        morphs[3] = dom.createElementMorph(element4);
        morphs[4] = dom.createMorphAt(element4, 0, 0);
        morphs[5] = dom.createMorphAt(element3, 3, 3);
        morphs[6] = dom.createElementMorph(element5);
        morphs[7] = dom.createMorphAt(element5, 0, 0);
        return morphs;
      },
      statements: [["content", "model.origin.extractor", ["loc", [null, [5, 20], [5, 46]]]], ["inline", "moment-format", [["get", "model.createdAt", ["loc", [null, [7, 39], [7, 54]]]]], [], ["loc", [null, [7, 23], [7, 56]]]], ["block", "liquid-if", [["get", "showDetails", ["loc", [null, [10, 15], [10, 26]]]]], [], 0, null, ["loc", [null, [10, 2], [14, 16]]]], ["element", "action", ["toggleDetails"], [], ["loc", [null, [17, 7], [17, 33]]]], ["inline", "t", ["action.details"], [], ["loc", [null, [17, 34], [17, 56]]]], ["block", "if", [["get", "model.isPrivate", ["loc", [null, [18, 8], [18, 23]]]]], [], 1, 2, ["loc", [null, [18, 2], [22, 9]]]], ["element", "action", ["delete"], [], ["loc", [null, [23, 7], [23, 26]]]], ["inline", "t", ["action.delete"], [], ["loc", [null, [23, 27], [23, 48]]]]],
      locals: [],
      templates: [child0, child1, child2]
    };
  })());
});
define('rose/pods/components/rose-interaction/component', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Component.extend({
    classNames: ['comment'],
    showDetails: false,

    jsonData: (function () {
      return JSON.stringify(this.get('model'), null, 2);
    }).property('model'),

    actions: {
      toggleDetails: function toggleDetails() {
        this.toggleProperty('showDetails');
      },
      hide: function hide() {
        this.set('model.isPrivate', true);
        this.get('model').save();
      },
      unhide: function unhide() {
        this.set('model.isPrivate', false);
        this.get('model').save();
      },
      'delete': function _delete() {
        this.get('model').destroyRecord();
      }
    }
  });
});
define("rose/pods/components/rose-interaction/template", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 6,
              "column": 2
            },
            "end": {
              "line": 8,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-interaction/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode(" ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("strong");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(2);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          morphs[1] = dom.createMorphAt(dom.childAt(fragment, [3]), 0, 0);
          return morphs;
        },
        statements: [["inline", "t", ["interactions.actionOn"], [], ["loc", [null, [7, 4], [7, 33]]]], ["content", "model.origin.target.contentId", ["loc", [null, [7, 42], [7, 75]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 8,
                "column": 2
              },
              "end": {
                "line": 10,
                "column": 2
              }
            },
            "moduleName": "rose/pods/components/rose-interaction/template.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("    ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode(" ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("strong");
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(2);
            morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
            morphs[1] = dom.createMorphAt(dom.childAt(fragment, [3]), 0, 0);
            return morphs;
          },
          statements: [["inline", "t", ["interactions.actionOn"], [], ["loc", [null, [9, 4], [9, 33]]]], ["content", "model.origin.target.commentId", ["loc", [null, [9, 42], [9, 75]]]]],
          locals: [],
          templates: []
        };
      })();
      var child1 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 10,
                "column": 2
              },
              "end": {
                "line": 12,
                "column": 2
              }
            },
            "moduleName": "rose/pods/components/rose-interaction/template.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("    ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n  ");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
            return morphs;
          },
          statements: [["inline", "t", ["interactions.action"], [], ["loc", [null, [11, 4], [11, 31]]]]],
          locals: [],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 8,
              "column": 2
            },
            "end": {
              "line": 12,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-interaction/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "if", [["get", "model.origin.target.commentId", ["loc", [null, [8, 12], [8, 41]]]]], [], 0, 1, ["loc", [null, [8, 2], [12, 2]]]]],
        locals: [],
        templates: [child0, child1]
      };
    })();
    var child2 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 17,
              "column": 2
            },
            "end": {
              "line": 21,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-interaction/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "ui segment");
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("pre");
          var el3 = dom.createElement("code");
          var el4 = dom.createComment("");
          dom.appendChild(el3, el4);
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1, 1, 0]), 0, 0);
          return morphs;
        },
        statements: [["content", "jsonData", ["loc", [null, [19, 15], [19, 27]]]]],
        locals: [],
        templates: []
      };
    })();
    var child3 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 25,
              "column": 2
            },
            "end": {
              "line": 27,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-interaction/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element1 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element1);
          morphs[1] = dom.createMorphAt(element1, 0, 0);
          return morphs;
        },
        statements: [["element", "action", ["unhide"], [], ["loc", [null, [26, 7], [26, 26]]]], ["inline", "t", ["action.unhide"], [], ["loc", [null, [26, 27], [26, 48]]]]],
        locals: [],
        templates: []
      };
    })();
    var child4 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 27,
              "column": 2
            },
            "end": {
              "line": 29,
              "column": 2
            }
          },
          "moduleName": "rose/pods/components/rose-interaction/template.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("a");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createElementMorph(element0);
          morphs[1] = dom.createMorphAt(element0, 0, 0);
          return morphs;
        },
        statements: [["element", "action", ["hide"], [], ["loc", [null, [28, 7], [28, 24]]]], ["inline", "t", ["action.hide"], [], ["loc", [null, [28, 25], [28, 44]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 33,
            "column": 0
          }
        },
        "moduleName": "rose/pods/components/rose-interaction/template.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("a");
        dom.setAttribute(el1, "class", "avatar");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "circular pointing right icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "content");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("a");
        dom.setAttribute(el2, "class", "author");
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "metadata");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("span");
        dom.setAttribute(el3, "class", "date");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "text");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "actions");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("a");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("a");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element2 = dom.childAt(fragment, [2]);
        var element3 = dom.childAt(element2, [9]);
        var element4 = dom.childAt(element3, [1]);
        var element5 = dom.childAt(element3, [5]);
        var morphs = new Array(9);
        morphs[0] = dom.createMorphAt(dom.childAt(element2, [1]), 0, 0);
        morphs[1] = dom.createMorphAt(element2, 3, 3);
        morphs[2] = dom.createMorphAt(dom.childAt(element2, [5, 1]), 0, 0);
        morphs[3] = dom.createMorphAt(dom.childAt(element2, [7]), 1, 1);
        morphs[4] = dom.createElementMorph(element4);
        morphs[5] = dom.createMorphAt(element4, 0, 0);
        morphs[6] = dom.createMorphAt(element3, 3, 3);
        morphs[7] = dom.createElementMorph(element5);
        morphs[8] = dom.createMorphAt(element5, 0, 0);
        return morphs;
      },
      statements: [["content", "model.origin.observer", ["loc", [null, [5, 20], [5, 45]]]], ["block", "if", [["get", "model.origin.target.contentId", ["loc", [null, [6, 8], [6, 37]]]]], [], 0, 1, ["loc", [null, [6, 2], [12, 9]]]], ["inline", "moment-format", [["get", "model.createdAt", ["loc", [null, [14, 39], [14, 54]]]]], [], ["loc", [null, [14, 23], [14, 56]]]], ["block", "liquid-if", [["get", "showDetails", ["loc", [null, [17, 15], [17, 26]]]]], [], 2, null, ["loc", [null, [17, 2], [21, 16]]]], ["element", "action", ["toggleDetails"], [], ["loc", [null, [24, 7], [24, 33]]]], ["inline", "t", ["action.details"], [], ["loc", [null, [24, 34], [24, 56]]]], ["block", "if", [["get", "model.isPrivate", ["loc", [null, [25, 8], [25, 23]]]]], [], 3, 4, ["loc", [null, [25, 2], [29, 9]]]], ["element", "action", ["delete"], [], ["loc", [null, [30, 7], [30, 26]]]], ["inline", "t", ["action.delete"], [], ["loc", [null, [30, 27], [30, 48]]]]],
      locals: [],
      templates: [child0, child1, child2, child3, child4]
    };
  })());
});
define('rose/router', ['exports', 'ember', 'rose/config/environment'], function (exports, _ember, _roseConfigEnvironment) {

  var Router = _ember['default'].Router.extend({
    location: _roseConfigEnvironment['default'].locationType
  });

  exports['default'] = Router.map(function () {
    this.route('about');
    this.route('help');
    this.route('diary');
    this.route('backup');
    this.route('settings');
    this.route('comments', { path: '/:network_name/comments' });
    this.route('interactions', { path: '/:network_name/interactions' });
    this.route('extracts', { path: '/:network_name/extracts' });
    this.route('study-creator');
    this.route('debug-log', {});
  });
});
define('rose/routes/about', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Route.extend({});
});
define('rose/routes/application', ['exports', 'ember'], function (exports, _ember) {
  var Promise = _ember['default'].RSVP.Promise;
  exports['default'] = _ember['default'].Route.extend({
    beforeModel: function beforeModel() {
      var settings = this.get('settings');
      return Promise.all([settings.setup()]);
    },

    afterModel: function afterModel() {
      this.set('i18n.locale', this.get('settings.user.currentLanguage'));
    },

    setupController: function setupController(controller, model) {
      this._super(controller, model);

      return this.store.find('network').then(function (networks) {
        controller.set('networks', networks);
      });
    },

    actions: {
      resetConfig: function resetConfig() {
        var _this = this;

        var settings = this.get('settings.user');
        settings.destroyRecord().then(function () {
          return _this.get('settings').setup();
        }).then(function () {
          return _this.transitionTo('application');
        });
      },

      loading: function loading() {
        var _this2 = this;

        this.controller.set('isLoading', true);
        this.router.one('didTransition', function () {
          _this2.controller.set('isLoading', false);
        });
        return true;
      }
    }
  });
});
define('rose/routes/backup', ['exports', 'ember'], function (exports, _ember) {

  var getItem = function getItem(key) {
    return new _ember['default'].RSVP.Promise(function (resolve) {
      kango.invokeAsyncCallback('localforage.getItem', key, function (data) {
        resolve({
          type: key,
          data: data
        });
      });
    });
  };

  exports['default'] = _ember['default'].Route.extend({
    model: function model() {
      var promises = [this.store.find('comment').then(function (records) {
        return { type: 'comment', data: records.invoke('serialize') };
      }), this.store.find('interaction').then(function (records) {
        return { type: 'interaction', data: records.invoke('serialize') };
      }), this.store.find('diary-entry').then(function (records) {
        return { type: 'diary-entry', data: records.invoke('serialize') };
      }), this.store.find('user-setting').then(function (records) {
        return { type: 'user-setting', data: records.invoke('serialize') };
      }), this.store.find('system-config').then(function (records) {
        return { type: 'system-config', data: records.invoke('serialize') };
      }), getItem('click-activity-records'), getItem('mousemove-activity-records'), getItem('window-activity-records'), getItem('scroll-activity-records'), getItem('fb-login-activity-records'), getItem('install-date'), getItem('rose-data-version')];

      return _ember['default'].RSVP.all(promises);
    }
  });
});
define('rose/routes/comments', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Route.extend({
    model: function model(params) {
      return this.store.find('comment', { network: params.network_name });
    }
  });
});
define('rose/routes/debug-log', ['exports', 'ember'], function (exports, _ember) {
    exports['default'] = _ember['default'].Route.extend({
        model: function model() {
            var debugLog = [];

            return new Promise(function (resolve, reject) {
                kango.invokeAsyncCallback('localforage.getItem', 'application-log', function (log) {
                    log.forEach(function (item) {
                        return debugLog.push(item);
                    });
                    resolve(debugLog.reverse());
                });
            });
        }
    });
});
define('rose/routes/diary', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Route.extend({
    model: function model() {
      return this.store.find('diary-entry');
    }
  });
});
define('rose/routes/extracts', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Route.extend({
    model: function model(params) {
      return this.store.find('extract').then(function (records) {
        return records.filterBy('origin.network', params.network_name);
      });
    }
  });
});
define('rose/routes/help', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Route.extend({});
});
define('rose/routes/index', ['exports', 'ember'], function (exports, _ember) {

  var getItem = function getItem(key) {
    return new _ember['default'].RSVP.Promise(function (resolve) {
      kango.invokeAsyncCallback('localforage.getItem', key, function (data) {
        resolve(data);
      });
    });
  };

  exports['default'] = _ember['default'].Route.extend({
    model: function model() {
      var promises = [getItem('click-activity-records'), getItem('mousemove-activity-records'), getItem('scroll-activity-records'), getItem('window-activity-records'), getItem('fb-login-activity-records')];

      return _ember['default'].RSVP.all(promises);
    }
  });
});
define('rose/routes/interactions', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Route.extend({
    model: function model(params) {
      return this.store.find('interaction').then(function (records) {
        return records.filterBy('origin.network', params.network_name);
      });
    }
  });
});
define('rose/routes/settings', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = _ember['default'].Route.extend({});
});
define('rose/routes/study-creator', ['exports', 'ember', 'rose/defaults/study-creator'], function (exports, _ember, _roseDefaultsStudyCreator) {
  exports['default'] = _ember['default'].Route.extend({
    model: function model() {
      var _this = this;

      return this.store.find('study-creator-setting').then(function (settings) {
        if (_ember['default'].isEmpty(settings)) {
          return _this.store.createRecord('study-creator-setting', _roseDefaultsStudyCreator['default']);
        }

        return settings.get('firstObject');
      });
    }
  });
});
define("rose/services/i18n", ["exports", "ember-i18n/service"], function (exports, _emberI18nService) {
  exports["default"] = _emberI18nService["default"];
});
define("rose/services/liquid-fire-modals", ["exports", "liquid-fire/modals"], function (exports, _liquidFireModals) {
  exports["default"] = _liquidFireModals["default"];
});
define("rose/services/liquid-fire-transitions", ["exports", "liquid-fire/transition-map"], function (exports, _liquidFireTransitionMap) {
  exports["default"] = _liquidFireTransitionMap["default"];
});
define('rose/services/moment', ['exports', 'ember', 'moment'], function (exports, _ember, _moment2) {
  var computed = _ember['default'].computed;
  exports['default'] = _ember['default'].Service.extend({
    _locale: null,
    _timeZone: null,

    locale: computed({
      get: function get() {
        return this.get('_locale');
      },
      set: function set(propertyKey, locale) {
        this.set('_locale', locale);
        return locale;
      }
    }),

    timeZone: computed({
      get: function get() {
        return this.get('_timeZone');
      },
      set: function set(propertyKey, timeZone) {
        if (_moment2['default'].tz) {
          this.set('_timeZone', timeZone);
          return timeZone;
        } else {
          _ember['default'].Logger.warn('[ember-moment] attempted to set timezone, but moment-timezone unavailable.');
        }
      }
    }),

    changeLocale: function changeLocale(locale) {
      this.set('locale', locale);
    },

    changeTimeZone: function changeTimeZone(timeZone) {
      this.set('timeZone', timeZone);
    },

    moment: function moment() {
      var time = _moment2['default'].apply(undefined, arguments);
      var locale = this.get('locale');
      var timeZone = this.get('timeZone');

      if (locale) {
        time = time.locale(locale);
      }

      if (timeZone && time.tz) {
        time = time.tz(timeZone);
      }

      return time;
    }
  });
});
define('rose/services/settings', ['exports', 'ember'], function (exports, _ember) {
    var isEmpty = _ember['default'].isEmpty;
    var service = _ember['default'].inject.service;
    var Promise = _ember['default'].RSVP.Promise;
    exports['default'] = _ember['default'].Service.extend({
        store: service(),

        setup: function setup() {
            var _this = this;

            var store = this.get('store');

            var userSettings = store.find('user-setting', { id: 0 }).then(function (settings) {
                if (!isEmpty(settings)) {
                    return settings.get('firstObject');
                }

                return store.createRecord('user-setting', { id: 0 }).save();
            }).then(function (setting) {
                _this.set('user', setting);
            });

            var systemSettings = store.find('system-config', { id: 0 }).then(function (settings) {
                if (!isEmpty(settings)) {
                    return settings.get('firstObject');
                }

                return store.createRecord('system-config', { id: 0 }).save();
            }).then(function (setting) {
                _this.set('system', setting);
            });

            return Promise.all([userSettings, systemSettings]);
        }
    });
});
define("rose/templates/about", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 36,
            "column": 0
          }
        },
        "moduleName": "rose/templates/about.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "info icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("p");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui divider");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\nROSE ");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("p");
        var el2 = dom.createTextNode("Oliver Hoffmann, Sebastian Ruhleder ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode(" Felix Epp");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui basic segment");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("address");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("strong");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("br");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("br");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    64295 Darmstadt");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("br");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("p");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode(" ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("a");
        dom.setAttribute(el2, "href", "mailto: andreas.poller@ sit.fraunhofer.de");
        var el3 = dom.createTextNode("Andreas Poller, andreas.poller@sit.fraunhofer.de");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui divider");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("p");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0, 3]);
        var element1 = dom.childAt(fragment, [10, 1]);
        var morphs = new Array(10);
        morphs[0] = dom.createMorphAt(element0, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element0, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(dom.childAt(fragment, [2]), 1, 1);
        morphs[3] = dom.createMorphAt(fragment, 6, 6, contextualElement);
        morphs[4] = dom.createMorphAt(dom.childAt(fragment, [8]), 1, 1);
        morphs[5] = dom.createMorphAt(dom.childAt(element1, [1]), 0, 0);
        morphs[6] = dom.createMorphAt(element1, 4, 4);
        morphs[7] = dom.createMorphAt(element1, 9, 9);
        morphs[8] = dom.createMorphAt(dom.childAt(fragment, [12]), 1, 1);
        morphs[9] = dom.createMorphAt(dom.childAt(fragment, [16]), 1, 1);
        return morphs;
      },
      statements: [["inline", "t", ["about.title"], [], ["loc", [null, [4, 4], [4, 23]]]], ["inline", "t", ["about.subtitle"], [], ["loc", [null, [5, 28], [5, 50]]]], ["inline", "t", ["about.description"], [], ["loc", [null, [10, 2], [10, 27]]]], ["inline", "t", ["about.developedBy"], [], ["loc", [null, [15, 5], [15, 30]]]], ["inline", "t", ["and"], [], ["loc", [null, [17, 39], [17, 50]]]], ["inline", "t", ["about.address.name"], [], ["loc", [null, [21, 12], [21, 38]]]], ["inline", "t", ["about.address.street"], [], ["loc", [null, [22, 4], [22, 32]]]], ["inline", "t", ["about.address.country"], [], ["loc", [null, [24, 4], [24, 33]]]], ["inline", "t", ["about.forQuestions"], [], ["loc", [null, [28, 2], [28, 28]]]], ["inline", "t", ["about.licenceNotice"], [], ["loc", [null, [34, 2], [34, 29]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/application", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 5,
              "column": 0
            }
          },
          "moduleName": "rose/templates/application.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "installation-wizard", [], ["cancel", "cancelWizard", "onsuccess", "saveConfig"], ["loc", [null, [3, 0], [3, 68]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 5,
              "column": 0
            },
            "end": {
              "line": 19,
              "column": 0
            }
          },
          "moduleName": "rose/templates/application.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "ui page grid");
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2, "class", "four wide column");
          var el3 = dom.createTextNode("\n    ");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n  ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2, "class", "twelve wide column");
          var el3 = dom.createTextNode("\n    ");
          dom.appendChild(el2, el3);
          var el3 = dom.createElement("div");
          var el4 = dom.createTextNode("\n      ");
          dom.appendChild(el3, el4);
          var el4 = dom.createComment("");
          dom.appendChild(el3, el4);
          var el4 = dom.createTextNode("\n    ");
          dom.appendChild(el3, el4);
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n  ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [1]);
          var element1 = dom.childAt(element0, [3, 1]);
          var morphs = new Array(3);
          morphs[0] = dom.createMorphAt(dom.childAt(element0, [1]), 1, 1);
          morphs[1] = dom.createAttrMorph(element1, 'class');
          morphs[2] = dom.createMorphAt(element1, 1, 1);
          return morphs;
        },
        statements: [["inline", "partial", ["sidebar-menu"], [], ["loc", [null, [9, 4], [9, 30]]]], ["attribute", "class", ["concat", ["ui segment ", ["subexpr", "if", [["get", "isLoading", ["loc", [null, [13, 32], [13, 41]]]], "loading"], [], ["loc", [null, [13, 27], [13, 53]]]]]]], ["content", "outlet", ["loc", [null, [14, 6], [14, 16]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 20,
            "column": 0
          }
        },
        "moduleName": "rose/templates/application.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["block", "if", [["get", "settings.user.firstRun", ["loc", [null, [1, 6], [1, 28]]]]], [], 0, 1, ["loc", [null, [1, 0], [19, 7]]]]],
      locals: [],
      templates: [child0, child1]
    };
  })());
});
define("rose/templates/backup", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 32,
            "column": 0
          }
        },
        "moduleName": "rose/templates/backup.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "download icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui form");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("button");
        dom.setAttribute(el3, "class", "ui primary button");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("button");
        dom.setAttribute(el2, "class", "ui primary button");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0, 3]);
        var element1 = dom.childAt(fragment, [2]);
        var element2 = dom.childAt(element1, [1]);
        var element3 = dom.childAt(element2, [5]);
        var element4 = dom.childAt(element1, [3]);
        var element5 = dom.childAt(element1, [5]);
        var morphs = new Array(12);
        morphs[0] = dom.createMorphAt(element0, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element0, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(dom.childAt(element2, [1]), 0, 0);
        morphs[3] = dom.createMorphAt(dom.childAt(element2, [3]), 0, 0);
        morphs[4] = dom.createElementMorph(element3);
        morphs[5] = dom.createMorphAt(element3, 1, 1);
        morphs[6] = dom.createMorphAt(dom.childAt(element4, [1]), 0, 0);
        morphs[7] = dom.createMorphAt(dom.childAt(element4, [3]), 0, 0);
        morphs[8] = dom.createMorphAt(element4, 5, 5);
        morphs[9] = dom.createElementMorph(element5);
        morphs[10] = dom.createMorphAt(element5, 1, 1);
        morphs[11] = dom.createMorphAt(fragment, 4, 4, contextualElement);
        return morphs;
      },
      statements: [["inline", "t", ["backup.title"], [], ["loc", [null, [4, 4], [4, 24]]]], ["inline", "t", ["backup.subtitle"], [], ["loc", [null, [5, 28], [5, 51]]]], ["inline", "t", ["backup.resetData"], [], ["loc", [null, [11, 11], [11, 35]]]], ["inline", "t", ["backup.resetDataLabel"], [], ["loc", [null, [12, 7], [12, 36]]]], ["element", "action", ["openModal", "reset-data"], [], ["loc", [null, [14, 38], [14, 73]]]], ["inline", "t", ["action.reset"], [], ["loc", [null, [15, 6], [15, 26]]]], ["inline", "t", ["backup.export"], [], ["loc", [null, [20, 11], [20, 32]]]], ["inline", "t", ["backup.exportLabel"], [], ["loc", [null, [21, 7], [21, 33]]]], ["inline", "textarea", [], ["readonly", true, "value", ["subexpr", "@mut", [["get", "jsonData", ["loc", [null, [22, 35], [22, 43]]]]], [], []]], ["loc", [null, [22, 4], [22, 45]]]], ["element", "action", ["download"], [], ["loc", [null, [26, 36], [26, 57]]]], ["inline", "t", ["action.download"], [], ["loc", [null, [27, 4], [27, 27]]]], ["inline", "partial", ["modal/reset-data"], [], ["loc", [null, [31, 0], [31, 30]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/comments", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 9,
              "column": 0
            },
            "end": {
              "line": 13,
              "column": 0
            }
          },
          "moduleName": "rose/templates/comments.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "page-numbers", [], ["content", ["subexpr", "@mut", [["get", "pagedContent", ["loc", [null, [10, 26], [10, 38]]]]], [], []], "numPagesToShow", 5, "showFL", true], ["loc", [null, [10, 2], [12, 31]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 16,
              "column": 2
            },
            "end": {
              "line": 18,
              "column": 2
            }
          },
          "moduleName": "rose/templates/comments.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "rose-comment", [], ["model", ["subexpr", "@mut", [["get", "comment", ["loc", [null, [17, 25], [17, 32]]]]], [], []]], ["loc", [null, [17, 4], [17, 34]]]]],
        locals: ["comment"],
        templates: []
      };
    })();
    var child2 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 18,
              "column": 2
            },
            "end": {
              "line": 20,
              "column": 2
            }
          },
          "moduleName": "rose/templates/comments.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["content", "no-data-message", ["loc", [null, [19, 4], [19, 23]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 22,
            "column": 0
          }
        },
        "moduleName": "rose/templates/comments.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "settings icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui comments");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0, 3]);
        var morphs = new Array(4);
        morphs[0] = dom.createMorphAt(element0, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element0, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(fragment, 2, 2, contextualElement);
        morphs[3] = dom.createMorphAt(dom.childAt(fragment, [4]), 1, 1);
        return morphs;
      },
      statements: [["inline", "t", ["comments.title"], [], ["loc", [null, [4, 4], [4, 26]]]], ["inline", "t", ["comments.subtitle"], [], ["loc", [null, [5, 28], [5, 53]]]], ["block", "if", [["get", "pagedContent", ["loc", [null, [9, 6], [9, 18]]]]], [], 0, null, ["loc", [null, [9, 0], [13, 7]]]], ["block", "each", [["get", "pagedContent", ["loc", [null, [16, 10], [16, 22]]]]], [], 1, 2, ["loc", [null, [16, 2], [20, 11]]]]],
      locals: [],
      templates: [child0, child1, child2]
    };
  })());
});
define("rose/templates/components/high-charts", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/high-charts.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [["content", "yield", ["loc", [null, [1, 0], [1, 9]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/components/liquid-bind", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      var child0 = (function () {
        var child0 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 5,
                  "column": 4
                },
                "end": {
                  "line": 7,
                  "column": 4
                }
              },
              "moduleName": "rose/templates/components/liquid-bind.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
              dom.insertBoundary(fragment, 0);
              dom.insertBoundary(fragment, null);
              return morphs;
            },
            statements: [["inline", "yield", [["get", "version", ["loc", [null, [6, 15], [6, 22]]]]], [], ["loc", [null, [6, 6], [6, 26]]]]],
            locals: [],
            templates: []
          };
        })();
        var child1 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 7,
                  "column": 4
                },
                "end": {
                  "line": 9,
                  "column": 4
                }
              },
              "moduleName": "rose/templates/components/liquid-bind.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
              dom.insertBoundary(fragment, 0);
              dom.insertBoundary(fragment, null);
              return morphs;
            },
            statements: [["content", "version", ["loc", [null, [8, 6], [8, 20]]]]],
            locals: [],
            templates: []
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 2,
                "column": 2
              },
              "end": {
                "line": 11,
                "column": 0
              }
            },
            "moduleName": "rose/templates/components/liquid-bind.hbs"
          },
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["block", "if", [["get", "hasBlock", ["loc", [null, [5, 11], [5, 19]]]]], [], 0, 1, ["loc", [null, [5, 4], [9, 12]]]]],
          locals: ["version"],
          templates: [child0, child1]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 12,
              "column": 0
            }
          },
          "moduleName": "rose/templates/components/liquid-bind.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "liquid-versions", [], ["value", ["subexpr", "@mut", [["get", "attrs.value", ["loc", [null, [2, 28], [2, 39]]]]], [], []], "use", ["subexpr", "@mut", [["get", "use", ["loc", [null, [2, 44], [2, 47]]]]], [], []], "outletName", ["subexpr", "@mut", [["get", "attrs.outletName", ["loc", [null, [3, 32], [3, 48]]]]], [], []], "name", "liquid-bind", "renderWhenFalse", true, "class", ["subexpr", "@mut", [["get", "class", ["loc", [null, [4, 67], [4, 72]]]]], [], []]], 0, null, ["loc", [null, [2, 2], [11, 22]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    var child1 = (function () {
      var child0 = (function () {
        var child0 = (function () {
          var child0 = (function () {
            return {
              meta: {
                "revision": "Ember@1.13.12",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 25,
                    "column": 6
                  },
                  "end": {
                    "line": 27,
                    "column": 6
                  }
                },
                "moduleName": "rose/templates/components/liquid-bind.hbs"
              },
              arity: 0,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createComment("");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var morphs = new Array(1);
                morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
                dom.insertBoundary(fragment, 0);
                dom.insertBoundary(fragment, null);
                return morphs;
              },
              statements: [["inline", "yield", [["get", "version", ["loc", [null, [26, 17], [26, 24]]]]], [], ["loc", [null, [26, 8], [26, 28]]]]],
              locals: [],
              templates: []
            };
          })();
          var child1 = (function () {
            return {
              meta: {
                "revision": "Ember@1.13.12",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 27,
                    "column": 6
                  },
                  "end": {
                    "line": 29,
                    "column": 6
                  }
                },
                "moduleName": "rose/templates/components/liquid-bind.hbs"
              },
              arity: 0,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createComment("");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var morphs = new Array(1);
                morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
                dom.insertBoundary(fragment, 0);
                dom.insertBoundary(fragment, null);
                return morphs;
              },
              statements: [["content", "version", ["loc", [null, [28, 8], [28, 22]]]]],
              locals: [],
              templates: []
            };
          })();
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 21,
                  "column": 4
                },
                "end": {
                  "line": 31,
                  "column": 4
                }
              },
              "moduleName": "rose/templates/components/liquid-bind.hbs"
            },
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
              dom.insertBoundary(fragment, 0);
              dom.insertBoundary(fragment, null);
              return morphs;
            },
            statements: [["block", "if", [["get", "hasBlock", ["loc", [null, [25, 13], [25, 21]]]]], [], 0, 1, ["loc", [null, [25, 6], [29, 14]]]]],
            locals: ["version"],
            templates: [child0, child1]
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 13,
                "column": 2
              },
              "end": {
                "line": 32,
                "column": 2
              }
            },
            "moduleName": "rose/templates/components/liquid-bind.hbs"
          },
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["block", "liquid-versions", [], ["value", ["subexpr", "@mut", [["get", "attrs.value", ["loc", [null, [21, 30], [21, 41]]]]], [], []], "notify", ["subexpr", "@mut", [["get", "container", ["loc", [null, [21, 49], [21, 58]]]]], [], []], "use", ["subexpr", "@mut", [["get", "use", ["loc", [null, [21, 63], [21, 66]]]]], [], []], "outletName", ["subexpr", "@mut", [["get", "attrs.outletName", ["loc", [null, [22, 34], [22, 50]]]]], [], []], "name", "liquid-bind", "renderWhenFalse", true], 0, null, ["loc", [null, [21, 4], [31, 26]]]]],
          locals: ["container"],
          templates: [child0]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 12,
              "column": 0
            },
            "end": {
              "line": 33,
              "column": 0
            }
          },
          "moduleName": "rose/templates/components/liquid-bind.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "liquid-container", [], ["id", ["subexpr", "@mut", [["get", "id", ["loc", [null, [14, 9], [14, 11]]]]], [], []], "class", ["subexpr", "@mut", [["get", "class", ["loc", [null, [15, 12], [15, 17]]]]], [], []], "growDuration", ["subexpr", "@mut", [["get", "growDuration", ["loc", [null, [16, 19], [16, 31]]]]], [], []], "growPixelsPerSecond", ["subexpr", "@mut", [["get", "growPixelsPerSecond", ["loc", [null, [17, 26], [17, 45]]]]], [], []], "growEasing", ["subexpr", "@mut", [["get", "growEasing", ["loc", [null, [18, 17], [18, 27]]]]], [], []], "enableGrowth", ["subexpr", "@mut", [["get", "enableGrowth", ["loc", [null, [19, 19], [19, 31]]]]], [], []]], 0, null, ["loc", [null, [13, 2], [32, 25]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 34,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/liquid-bind.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["block", "if", [["get", "containerless", ["loc", [null, [1, 6], [1, 19]]]]], [], 0, 1, ["loc", [null, [1, 0], [33, 7]]]]],
      locals: [],
      templates: [child0, child1]
    };
  })());
});
define("rose/templates/components/liquid-container", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 1,
            "column": 14
          }
        },
        "moduleName": "rose/templates/components/liquid-container.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["inline", "yield", [["get", "this", ["loc", [null, [1, 8], [1, 12]]]]], [], ["loc", [null, [1, 0], [1, 14]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/components/liquid-if", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      var child0 = (function () {
        var child0 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 4,
                  "column": 4
                },
                "end": {
                  "line": 6,
                  "column": 4
                }
              },
              "moduleName": "rose/templates/components/liquid-if.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("      ");
              dom.appendChild(el0, el1);
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
              return morphs;
            },
            statements: [["content", "yield", ["loc", [null, [5, 6], [5, 15]]]]],
            locals: [],
            templates: []
          };
        })();
        var child1 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 6,
                  "column": 4
                },
                "end": {
                  "line": 8,
                  "column": 4
                }
              },
              "moduleName": "rose/templates/components/liquid-if.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("      ");
              dom.appendChild(el0, el1);
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
              return morphs;
            },
            statements: [["inline", "yield", [], ["to", "inverse"], ["loc", [null, [7, 6], [7, 28]]]]],
            locals: [],
            templates: []
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 2,
                "column": 2
              },
              "end": {
                "line": 9,
                "column": 2
              }
            },
            "moduleName": "rose/templates/components/liquid-if.hbs"
          },
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["block", "if", [["get", "valueVersion", ["loc", [null, [4, 10], [4, 22]]]]], [], 0, 1, ["loc", [null, [4, 4], [8, 11]]]]],
          locals: ["valueVersion"],
          templates: [child0, child1]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 10,
              "column": 0
            }
          },
          "moduleName": "rose/templates/components/liquid-if.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "liquid-versions", [], ["value", ["subexpr", "@mut", [["get", "showFirstBlock", ["loc", [null, [2, 27], [2, 41]]]]], [], []], "name", ["subexpr", "@mut", [["get", "helperName", ["loc", [null, [2, 47], [2, 57]]]]], [], []], "use", ["subexpr", "@mut", [["get", "use", ["loc", [null, [3, 27], [3, 30]]]]], [], []], "renderWhenFalse", ["subexpr", "hasBlock", ["inverse"], [], ["loc", [null, [3, 47], [3, 67]]]], "class", ["subexpr", "@mut", [["get", "class", ["loc", [null, [3, 74], [3, 79]]]]], [], []]], 0, null, ["loc", [null, [2, 2], [9, 22]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    var child1 = (function () {
      var child0 = (function () {
        var child0 = (function () {
          var child0 = (function () {
            return {
              meta: {
                "revision": "Ember@1.13.12",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 21,
                    "column": 6
                  },
                  "end": {
                    "line": 23,
                    "column": 6
                  }
                },
                "moduleName": "rose/templates/components/liquid-if.hbs"
              },
              arity: 0,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createTextNode("        ");
                dom.appendChild(el0, el1);
                var el1 = dom.createComment("");
                dom.appendChild(el0, el1);
                var el1 = dom.createTextNode("\n");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var morphs = new Array(1);
                morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
                return morphs;
              },
              statements: [["content", "yield", ["loc", [null, [22, 8], [22, 17]]]]],
              locals: [],
              templates: []
            };
          })();
          var child1 = (function () {
            return {
              meta: {
                "revision": "Ember@1.13.12",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 23,
                    "column": 6
                  },
                  "end": {
                    "line": 25,
                    "column": 6
                  }
                },
                "moduleName": "rose/templates/components/liquid-if.hbs"
              },
              arity: 0,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createTextNode("        ");
                dom.appendChild(el0, el1);
                var el1 = dom.createComment("");
                dom.appendChild(el0, el1);
                var el1 = dom.createTextNode("\n");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var morphs = new Array(1);
                morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
                return morphs;
              },
              statements: [["inline", "yield", [], ["to", "inverse"], ["loc", [null, [24, 8], [24, 30]]]]],
              locals: [],
              templates: []
            };
          })();
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 19,
                  "column": 4
                },
                "end": {
                  "line": 26,
                  "column": 4
                }
              },
              "moduleName": "rose/templates/components/liquid-if.hbs"
            },
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
              dom.insertBoundary(fragment, 0);
              dom.insertBoundary(fragment, null);
              return morphs;
            },
            statements: [["block", "if", [["get", "valueVersion", ["loc", [null, [21, 12], [21, 24]]]]], [], 0, 1, ["loc", [null, [21, 6], [25, 13]]]]],
            locals: ["valueVersion"],
            templates: [child0, child1]
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 11,
                "column": 2
              },
              "end": {
                "line": 27,
                "column": 2
              }
            },
            "moduleName": "rose/templates/components/liquid-if.hbs"
          },
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["block", "liquid-versions", [], ["value", ["subexpr", "@mut", [["get", "showFirstBlock", ["loc", [null, [19, 29], [19, 43]]]]], [], []], "notify", ["subexpr", "@mut", [["get", "container", ["loc", [null, [19, 51], [19, 60]]]]], [], []], "name", ["subexpr", "@mut", [["get", "helperName", ["loc", [null, [19, 66], [19, 76]]]]], [], []], "use", ["subexpr", "@mut", [["get", "use", ["loc", [null, [20, 8], [20, 11]]]]], [], []], "renderWhenFalse", ["subexpr", "hasBlock", ["inverse"], [], ["loc", [null, [20, 28], [20, 48]]]]], 0, null, ["loc", [null, [19, 4], [26, 24]]]]],
          locals: ["container"],
          templates: [child0]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 10,
              "column": 0
            },
            "end": {
              "line": 28,
              "column": 0
            }
          },
          "moduleName": "rose/templates/components/liquid-if.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "liquid-container", [], ["id", ["subexpr", "@mut", [["get", "id", ["loc", [null, [12, 9], [12, 11]]]]], [], []], "class", ["subexpr", "@mut", [["get", "class", ["loc", [null, [13, 12], [13, 17]]]]], [], []], "growDuration", ["subexpr", "@mut", [["get", "growDuration", ["loc", [null, [14, 19], [14, 31]]]]], [], []], "growPixelsPerSecond", ["subexpr", "@mut", [["get", "growPixelsPerSecond", ["loc", [null, [15, 26], [15, 45]]]]], [], []], "growEasing", ["subexpr", "@mut", [["get", "growEasing", ["loc", [null, [16, 17], [16, 27]]]]], [], []], "enableGrowth", ["subexpr", "@mut", [["get", "enableGrowth", ["loc", [null, [17, 19], [17, 31]]]]], [], []]], 0, null, ["loc", [null, [11, 2], [27, 23]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 29,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/liquid-if.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["block", "if", [["get", "containerless", ["loc", [null, [1, 6], [1, 19]]]]], [], 0, 1, ["loc", [null, [1, 0], [28, 7]]]]],
      locals: [],
      templates: [child0, child1]
    };
  })());
});
define("rose/templates/components/liquid-modal", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 2,
                "column": 2
              },
              "end": {
                "line": 6,
                "column": 2
              }
            },
            "moduleName": "rose/templates/components/liquid-modal.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("    ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1, "role", "dialog");
            var el2 = dom.createTextNode("\n      ");
            dom.appendChild(el1, el2);
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n    ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var element0 = dom.childAt(fragment, [1]);
            var morphs = new Array(4);
            morphs[0] = dom.createAttrMorph(element0, 'class');
            morphs[1] = dom.createAttrMorph(element0, 'aria-labelledby');
            morphs[2] = dom.createAttrMorph(element0, 'aria-label');
            morphs[3] = dom.createMorphAt(element0, 1, 1);
            return morphs;
          },
          statements: [["attribute", "class", ["concat", ["lf-dialog ", ["get", "cc.options.dialogClass", ["loc", [null, [3, 28], [3, 50]]]]]]], ["attribute", "aria-labelledby", ["get", "cc.options.ariaLabelledBy", ["loc", [null, [3, 86], [3, 111]]]]], ["attribute", "aria-label", ["get", "cc.options.ariaLabel", ["loc", [null, [3, 127], [3, 147]]]]], ["inline", "lf-vue", [["get", "cc.view", ["loc", [null, [4, 15], [4, 22]]]]], ["dismiss", "dismiss"], ["loc", [null, [4, 6], [4, 42]]]]],
          locals: [],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 8,
              "column": 0
            }
          },
          "moduleName": "rose/templates/components/liquid-modal.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(2);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          morphs[1] = dom.createMorphAt(fragment, 2, 2, contextualElement);
          dom.insertBoundary(fragment, 0);
          return morphs;
        },
        statements: [["block", "lm-container", [], ["action", "escape", "clickAway", "outsideClick"], 0, null, ["loc", [null, [2, 2], [6, 19]]]], ["content", "lf-overlay", ["loc", [null, [7, 2], [7, 16]]]]],
        locals: ["cc"],
        templates: [child0]
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 9,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/liquid-modal.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["block", "liquid-versions", [], ["name", "liquid-modal", "value", ["subexpr", "@mut", [["get", "currentContext", ["loc", [null, [1, 45], [1, 59]]]]], [], []], "renderWhenFalse", false], 0, null, ["loc", [null, [1, 0], [8, 20]]]]],
      locals: [],
      templates: [child0]
    };
  })());
});
define("rose/templates/components/liquid-outlet", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      var child0 = (function () {
        var child0 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 15,
                  "column": 6
                },
                "end": {
                  "line": 17,
                  "column": 6
                }
              },
              "moduleName": "rose/templates/components/liquid-outlet.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
              dom.insertBoundary(fragment, 0);
              dom.insertBoundary(fragment, null);
              return morphs;
            },
            statements: [["inline", "outlet", [["get", "outletName", ["loc", [null, [16, 17], [16, 27]]]]], [], ["loc", [null, [16, 8], [16, 29]]]]],
            locals: [],
            templates: []
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 2,
                "column": 2
              },
              "end": {
                "line": 19,
                "column": 2
              }
            },
            "moduleName": "rose/templates/components/liquid-outlet.hbs"
          },
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["block", "set-outlet-state", [["get", "outletName", ["loc", [null, [15, 26], [15, 36]]]], ["get", "version.outletState", ["loc", [null, [15, 37], [15, 56]]]]], [], 0, null, ["loc", [null, [15, 6], [17, 28]]]]],
          locals: ["version"],
          templates: [child0]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 20,
              "column": 0
            }
          },
          "moduleName": "rose/templates/components/liquid-outlet.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "liquid-bind", [["get", "outletState", ["loc", [null, [2, 17], [2, 28]]]]], ["id", ["subexpr", "@mut", [["get", "id", ["loc", [null, [3, 9], [3, 11]]]]], [], []], "class", ["subexpr", "@mut", [["get", "class", ["loc", [null, [4, 12], [4, 17]]]]], [], []], "use", ["subexpr", "@mut", [["get", "use", ["loc", [null, [5, 10], [5, 13]]]]], [], []], "name", "liquid-outlet", "outletName", ["subexpr", "@mut", [["get", "outletName", ["loc", [null, [7, 17], [7, 27]]]]], [], []], "containerless", ["subexpr", "@mut", [["get", "containerless", ["loc", [null, [8, 20], [8, 33]]]]], [], []], "growDuration", ["subexpr", "@mut", [["get", "growDuration", ["loc", [null, [9, 19], [9, 31]]]]], [], []], "growPixelsPerSecond", ["subexpr", "@mut", [["get", "growPixelsPerSecond", ["loc", [null, [10, 26], [10, 45]]]]], [], []], "growEasing", ["subexpr", "@mut", [["get", "growEasing", ["loc", [null, [11, 17], [11, 27]]]]], [], []], "enableGrowth", ["subexpr", "@mut", [["get", "enableGrowth", ["loc", [null, [12, 19], [12, 31]]]]], [], []]], 0, null, ["loc", [null, [2, 2], [19, 20]]]]],
        locals: ["outletState"],
        templates: [child0]
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 21,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/liquid-outlet.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["block", "get-outlet-state", [["get", "outletName", ["loc", [null, [1, 21], [1, 31]]]]], [], 0, null, ["loc", [null, [1, 0], [20, 21]]]]],
      locals: [],
      templates: [child0]
    };
  })());
});
define("rose/templates/components/liquid-versions", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      var child0 = (function () {
        var child0 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 3,
                  "column": 4
                },
                "end": {
                  "line": 5,
                  "column": 4
                }
              },
              "moduleName": "rose/templates/components/liquid-versions.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
              dom.insertBoundary(fragment, 0);
              dom.insertBoundary(fragment, null);
              return morphs;
            },
            statements: [["inline", "yield", [["get", "version.value", ["loc", [null, [4, 14], [4, 27]]]]], [], ["loc", [null, [4, 6], [4, 31]]]]],
            locals: [],
            templates: []
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 2,
                "column": 2
              },
              "end": {
                "line": 6,
                "column": 2
              }
            },
            "moduleName": "rose/templates/components/liquid-versions.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["block", "liquid-child", [], ["version", ["subexpr", "@mut", [["get", "version", ["loc", [null, [3, 28], [3, 35]]]]], [], []], "liquidChildDidRender", "childDidRender", "class", ["subexpr", "@mut", [["get", "class", ["loc", [null, [3, 80], [3, 85]]]]], [], []]], 0, null, ["loc", [null, [3, 4], [5, 21]]]]],
          locals: [],
          templates: [child0]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 7,
              "column": 0
            }
          },
          "moduleName": "rose/templates/components/liquid-versions.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "if", [["get", "version.shouldRender", ["loc", [null, [2, 8], [2, 28]]]]], [], 0, null, ["loc", [null, [2, 2], [6, 9]]]]],
        locals: ["version"],
        templates: [child0]
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 8,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/liquid-versions.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["block", "each", [["get", "versions", ["loc", [null, [1, 8], [1, 16]]]]], ["key", "@identity"], 0, null, ["loc", [null, [1, 0], [7, 9]]]]],
      locals: [],
      templates: [child0]
    };
  })());
});
define("rose/templates/components/liquid-with", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 2,
                "column": 2
              },
              "end": {
                "line": 4,
                "column": 2
              }
            },
            "moduleName": "rose/templates/components/liquid-with.hbs"
          },
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["inline", "yield", [["get", "version", ["loc", [null, [3, 13], [3, 20]]]]], [], ["loc", [null, [3, 4], [3, 24]]]]],
          locals: ["version"],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 5,
              "column": 0
            }
          },
          "moduleName": "rose/templates/components/liquid-with.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "liquid-versions", [], ["value", ["subexpr", "@mut", [["get", "attrs.value", ["loc", [null, [2, 28], [2, 39]]]]], [], []], "use", ["subexpr", "@mut", [["get", "use", ["loc", [null, [2, 44], [2, 47]]]]], [], []], "name", ["subexpr", "@mut", [["get", "name", ["loc", [null, [2, 53], [2, 57]]]]], [], []], "class", ["subexpr", "@mut", [["get", "class", ["loc", [null, [2, 64], [2, 69]]]]], [], []]], 0, null, ["loc", [null, [2, 2], [4, 23]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    var child1 = (function () {
      var child0 = (function () {
        var child0 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 14,
                  "column": 4
                },
                "end": {
                  "line": 16,
                  "column": 4
                }
              },
              "moduleName": "rose/templates/components/liquid-with.hbs"
            },
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
              dom.insertBoundary(fragment, 0);
              dom.insertBoundary(fragment, null);
              return morphs;
            },
            statements: [["inline", "yield", [["get", "version", ["loc", [null, [15, 15], [15, 22]]]]], [], ["loc", [null, [15, 6], [15, 26]]]]],
            locals: ["version"],
            templates: []
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 6,
                "column": 2
              },
              "end": {
                "line": 17,
                "column": 2
              }
            },
            "moduleName": "rose/templates/components/liquid-with.hbs"
          },
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [["block", "liquid-versions", [], ["value", ["subexpr", "@mut", [["get", "attrs.value", ["loc", [null, [14, 30], [14, 41]]]]], [], []], "notify", ["subexpr", "@mut", [["get", "container", ["loc", [null, [14, 49], [14, 58]]]]], [], []], "use", ["subexpr", "@mut", [["get", "use", ["loc", [null, [14, 63], [14, 66]]]]], [], []], "name", ["subexpr", "@mut", [["get", "name", ["loc", [null, [14, 72], [14, 76]]]]], [], []]], 0, null, ["loc", [null, [14, 4], [16, 25]]]]],
          locals: ["container"],
          templates: [child0]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 5,
              "column": 0
            },
            "end": {
              "line": 18,
              "column": 0
            }
          },
          "moduleName": "rose/templates/components/liquid-with.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "liquid-container", [], ["id", ["subexpr", "@mut", [["get", "id", ["loc", [null, [7, 9], [7, 11]]]]], [], []], "class", ["subexpr", "@mut", [["get", "class", ["loc", [null, [8, 12], [8, 17]]]]], [], []], "growDuration", ["subexpr", "@mut", [["get", "growDuration", ["loc", [null, [9, 19], [9, 31]]]]], [], []], "growPixelsPerSecond", ["subexpr", "@mut", [["get", "growPixelsPerSecond", ["loc", [null, [10, 26], [10, 45]]]]], [], []], "growEasing", ["subexpr", "@mut", [["get", "growEasing", ["loc", [null, [11, 17], [11, 27]]]]], [], []], "enableGrowth", ["subexpr", "@mut", [["get", "enableGrowth", ["loc", [null, [12, 19], [12, 31]]]]], [], []]], 0, null, ["loc", [null, [6, 2], [17, 23]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 19,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/liquid-with.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["block", "if", [["get", "containerless", ["loc", [null, [1, 6], [1, 19]]]]], [], 0, 1, ["loc", [null, [1, 0], [18, 7]]]]],
      locals: [],
      templates: [child0, child1]
    };
  })());
});
define("rose/templates/components/page-numbers", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 3,
              "column": 4
            },
            "end": {
              "line": 7,
              "column": 4
            }
          },
          "moduleName": "rose/templates/components/page-numbers.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("li");
          dom.setAttribute(el1, "class", "arrow prev enabled-arrow");
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("a");
          dom.setAttribute(el2, "href", "#");
          var el3 = dom.createTextNode("«");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element4 = dom.childAt(fragment, [1, 1]);
          var morphs = new Array(1);
          morphs[0] = dom.createElementMorph(element4);
          return morphs;
        },
        statements: [["element", "action", ["incrementPage", -1], [], ["loc", [null, [5, 20], [5, 49]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 7,
              "column": 4
            },
            "end": {
              "line": 11,
              "column": 4
            }
          },
          "moduleName": "rose/templates/components/page-numbers.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("li");
          dom.setAttribute(el1, "class", "arrow prev disabled");
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("a");
          dom.setAttribute(el2, "href", "#");
          var el3 = dom.createTextNode("«");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element3 = dom.childAt(fragment, [1, 1]);
          var morphs = new Array(1);
          morphs[0] = dom.createElementMorph(element3);
          return morphs;
        },
        statements: [["element", "action", ["incrementPage", -1], [], ["loc", [null, [9, 20], [9, 49]]]]],
        locals: [],
        templates: []
      };
    })();
    var child2 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 14,
                "column": 6
              },
              "end": {
                "line": 18,
                "column": 6
              }
            },
            "moduleName": "rose/templates/components/page-numbers.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("li");
            dom.setAttribute(el1, "class", "dots disabled");
            var el2 = dom.createTextNode("\n          ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("span");
            var el3 = dom.createTextNode("...");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();
      var child1 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 19,
                "column": 6
              },
              "end": {
                "line": 23,
                "column": 6
              }
            },
            "moduleName": "rose/templates/components/page-numbers.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("li");
            dom.setAttribute(el1, "class", "active page-number");
            var el2 = dom.createTextNode("\n          ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("a");
            var el3 = dom.createComment("");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1, 1]), 0, 0);
            return morphs;
          },
          statements: [["content", "item.page", ["loc", [null, [21, 13], [21, 26]]]]],
          locals: [],
          templates: []
        };
      })();
      var child2 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 23,
                "column": 6
              },
              "end": {
                "line": 27,
                "column": 6
              }
            },
            "moduleName": "rose/templates/components/page-numbers.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("li");
            dom.setAttribute(el1, "class", "page-number");
            var el2 = dom.createTextNode("\n          ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("a");
            dom.setAttribute(el2, "href", "#");
            var el3 = dom.createComment("");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var element2 = dom.childAt(fragment, [1, 1]);
            var morphs = new Array(2);
            morphs[0] = dom.createElementMorph(element2);
            morphs[1] = dom.createMorphAt(element2, 0, 0);
            return morphs;
          },
          statements: [["element", "action", ["pageClicked", ["get", "item.page", ["loc", [null, [25, 45], [25, 54]]]]], [], ["loc", [null, [25, 22], [25, 56]]]], ["content", "item.page", ["loc", [null, [25, 57], [25, 70]]]]],
          locals: [],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 13,
              "column": 4
            },
            "end": {
              "line": 28,
              "column": 4
            }
          },
          "moduleName": "rose/templates/components/page-numbers.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(2);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          morphs[1] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "if", [["get", "item.dots", ["loc", [null, [14, 12], [14, 21]]]]], [], 0, null, ["loc", [null, [14, 6], [18, 13]]]], ["block", "if", [["get", "item.current", ["loc", [null, [19, 12], [19, 24]]]]], [], 1, 2, ["loc", [null, [19, 6], [27, 13]]]]],
        locals: ["item"],
        templates: [child0, child1, child2]
      };
    })();
    var child3 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 30,
              "column": 4
            },
            "end": {
              "line": 34,
              "column": 4
            }
          },
          "moduleName": "rose/templates/components/page-numbers.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("li");
          dom.setAttribute(el1, "class", "arrow next enabled-arrow");
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("a");
          dom.setAttribute(el2, "href", "#");
          var el3 = dom.createTextNode("»");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element1 = dom.childAt(fragment, [1, 1]);
          var morphs = new Array(1);
          morphs[0] = dom.createElementMorph(element1);
          return morphs;
        },
        statements: [["element", "action", ["incrementPage", 1], [], ["loc", [null, [32, 20], [32, 48]]]]],
        locals: [],
        templates: []
      };
    })();
    var child4 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 34,
              "column": 4
            },
            "end": {
              "line": 38,
              "column": 4
            }
          },
          "moduleName": "rose/templates/components/page-numbers.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("li");
          dom.setAttribute(el1, "class", "arrow next disabled");
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("a");
          dom.setAttribute(el2, "href", "#");
          var el3 = dom.createTextNode("»");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [1, 1]);
          var morphs = new Array(1);
          morphs[0] = dom.createElementMorph(element0);
          return morphs;
        },
        statements: [["element", "action", ["incrementPage", 1], [], ["loc", [null, [36, 20], [36, 48]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 41,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/page-numbers.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "pagination-centered");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("ul");
        dom.setAttribute(el2, "class", "pagination");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element5 = dom.childAt(fragment, [0, 1]);
        var morphs = new Array(3);
        morphs[0] = dom.createMorphAt(element5, 1, 1);
        morphs[1] = dom.createMorphAt(element5, 3, 3);
        morphs[2] = dom.createMorphAt(element5, 5, 5);
        return morphs;
      },
      statements: [["block", "if", [["get", "canStepBackward", ["loc", [null, [3, 10], [3, 25]]]]], [], 0, 1, ["loc", [null, [3, 4], [11, 11]]]], ["block", "each", [["get", "pageItems", ["loc", [null, [13, 12], [13, 21]]]]], [], 2, null, ["loc", [null, [13, 4], [28, 13]]]], ["block", "if", [["get", "canStepForward", ["loc", [null, [30, 10], [30, 24]]]]], [], 3, 4, ["loc", [null, [30, 4], [38, 11]]]]],
      locals: [],
      templates: [child0, child1, child2, child3, child4]
    };
  })());
});
define("rose/templates/components/ui-checkbox", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 3,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/ui-checkbox.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("input");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("label");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0]);
        if (this.cachedFragment) {
          dom.repairClonedNode(element0, [], true);
        }
        var morphs = new Array(6);
        morphs[0] = dom.createAttrMorph(element0, 'type');
        morphs[1] = dom.createAttrMorph(element0, 'name');
        morphs[2] = dom.createAttrMorph(element0, 'checked');
        morphs[3] = dom.createAttrMorph(element0, 'disabled');
        morphs[4] = dom.createAttrMorph(element0, 'data-id');
        morphs[5] = dom.createMorphAt(dom.childAt(fragment, [2]), 0, 0);
        return morphs;
      },
      statements: [["attribute", "type", ["get", "type", ["loc", [null, [1, 14], [1, 18]]]]], ["attribute", "name", ["get", "name", ["loc", [null, [1, 28], [1, 32]]]]], ["attribute", "checked", ["get", "checked", ["loc", [null, [1, 45], [1, 52]]]]], ["attribute", "disabled", ["get", "readonly", ["loc", [null, [1, 66], [1, 74]]]]], ["attribute", "data-id", ["get", "data-id", ["loc", [null, [1, 87], [1, 94]]]]], ["content", "label", ["loc", [null, [2, 7], [2, 16]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/components/ui-dropdown", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/ui-dropdown.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [["content", "yield", ["loc", [null, [1, 0], [1, 9]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/components/ui-modal", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/ui-modal.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [["content", "yield", ["loc", [null, [1, 0], [1, 9]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/components/ui-radio", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 3,
            "column": 0
          }
        },
        "moduleName": "rose/templates/components/ui-radio.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("input");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("label");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0]);
        if (this.cachedFragment) {
          dom.repairClonedNode(element0, [], true);
        }
        var morphs = new Array(6);
        morphs[0] = dom.createAttrMorph(element0, 'type');
        morphs[1] = dom.createAttrMorph(element0, 'name');
        morphs[2] = dom.createAttrMorph(element0, 'checked');
        morphs[3] = dom.createAttrMorph(element0, 'disabled');
        morphs[4] = dom.createAttrMorph(element0, 'data-id');
        morphs[5] = dom.createMorphAt(dom.childAt(fragment, [2]), 0, 0);
        return morphs;
      },
      statements: [["attribute", "type", ["get", "type", ["loc", [null, [1, 14], [1, 18]]]]], ["attribute", "name", ["get", "name", ["loc", [null, [1, 28], [1, 32]]]]], ["attribute", "checked", ["get", "checked", ["loc", [null, [1, 45], [1, 52]]]]], ["attribute", "disabled", ["get", "readonly", ["loc", [null, [1, 66], [1, 74]]]]], ["attribute", "data-id", ["get", "data-id", ["loc", [null, [1, 87], [1, 94]]]]], ["content", "label", ["loc", [null, [2, 7], [2, 16]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/debug-log", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 9,
              "column": 0
            },
            "end": {
              "line": 13,
              "column": 0
            }
          },
          "moduleName": "rose/templates/debug-log.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "page-numbers", [], ["content", ["subexpr", "@mut", [["get", "pagedContent", ["loc", [null, [10, 26], [10, 38]]]]], [], []], "numPagesToShow", 5, "showFL", true], ["loc", [null, [10, 2], [12, 31]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 24,
              "column": 4
            },
            "end": {
              "line": 30,
              "column": 4
            }
          },
          "moduleName": "rose/templates/debug-log.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("tr");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("td");
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("td");
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("td");
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [1]);
          var morphs = new Array(3);
          morphs[0] = dom.createMorphAt(dom.childAt(element0, [1]), 0, 0);
          morphs[1] = dom.createMorphAt(dom.childAt(element0, [3]), 0, 0);
          morphs[2] = dom.createMorphAt(dom.childAt(element0, [5]), 0, 0);
          return morphs;
        },
        statements: [["inline", "moment-format", [["get", "log.date", ["loc", [null, [26, 26], [26, 34]]]], "LLL"], [], ["loc", [null, [26, 10], [26, 42]]]], ["content", "log.message", ["loc", [null, [27, 10], [27, 25]]]], ["content", "log.module", ["loc", [null, [28, 10], [28, 24]]]]],
        locals: ["log"],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 34,
            "column": 0
          }
        },
        "moduleName": "rose/templates/debug-log.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "settings icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("table");
        dom.setAttribute(el1, "class", "ui celled table");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("thead");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("tr");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("th");
        var el5 = dom.createComment("");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("th");
        var el5 = dom.createComment("");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("th");
        var el5 = dom.createComment("");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("tbody");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element1 = dom.childAt(fragment, [0, 3]);
        var element2 = dom.childAt(fragment, [4]);
        var element3 = dom.childAt(element2, [1, 1]);
        var morphs = new Array(7);
        morphs[0] = dom.createMorphAt(element1, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element1, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(fragment, 2, 2, contextualElement);
        morphs[3] = dom.createMorphAt(dom.childAt(element3, [1]), 0, 0);
        morphs[4] = dom.createMorphAt(dom.childAt(element3, [3]), 0, 0);
        morphs[5] = dom.createMorphAt(dom.childAt(element3, [5]), 0, 0);
        morphs[6] = dom.createMorphAt(dom.childAt(element2, [3]), 1, 1);
        return morphs;
      },
      statements: [["inline", "t", ["debugLog.title"], [], ["loc", [null, [4, 4], [4, 26]]]], ["inline", "t", ["debugLog.subtitle"], [], ["loc", [null, [5, 28], [5, 53]]]], ["block", "if", [["get", "pagedContent", ["loc", [null, [9, 6], [9, 18]]]]], [], 0, null, ["loc", [null, [9, 0], [13, 7]]]], ["inline", "t", ["debugLog.date"], [], ["loc", [null, [18, 10], [18, 31]]]], ["inline", "t", ["debugLog.message"], [], ["loc", [null, [19, 10], [19, 34]]]], ["inline", "t", ["debugLog.module"], [], ["loc", [null, [20, 10], [20, 33]]]], ["block", "each", [["get", "pagedContent", ["loc", [null, [24, 12], [24, 24]]]]], [], 1, null, ["loc", [null, [24, 4], [30, 13]]]]],
      locals: [],
      templates: [child0, child1]
    };
  })());
});
define("rose/templates/diary", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 24,
              "column": 0
            },
            "end": {
              "line": 28,
              "column": 0
            }
          },
          "moduleName": "rose/templates/diary.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "page-numbers", [], ["content", ["subexpr", "@mut", [["get", "pagedContent", ["loc", [null, [25, 26], [25, 38]]]]], [], []], "numPagesToShow", 5, "showFL", true], ["loc", [null, [25, 2], [27, 31]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 31,
              "column": 2
            },
            "end": {
              "line": 33,
              "column": 2
            }
          },
          "moduleName": "rose/templates/diary.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "diary-entry", [], ["model", ["subexpr", "@mut", [["get", "entry", ["loc", [null, [32, 24], [32, 29]]]]], [], []]], ["loc", [null, [32, 4], [32, 31]]]]],
        locals: ["entry"],
        templates: []
      };
    })();
    var child2 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 33,
              "column": 2
            },
            "end": {
              "line": 35,
              "column": 2
            }
          },
          "moduleName": "rose/templates/diary.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["content", "no-data-message", ["loc", [null, [34, 4], [34, 23]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 37,
            "column": 0
          }
        },
        "moduleName": "rose/templates/diary.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "book icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui form");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("button");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("button");
        dom.setAttribute(el2, "class", "ui button");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui divider");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui comments");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0, 3]);
        var element1 = dom.childAt(fragment, [2]);
        var element2 = dom.childAt(element1, [3]);
        var element3 = dom.childAt(element1, [5]);
        var morphs = new Array(10);
        morphs[0] = dom.createMorphAt(element0, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element0, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(dom.childAt(element1, [1]), 1, 1);
        morphs[3] = dom.createAttrMorph(element2, 'class');
        morphs[4] = dom.createElementMorph(element2);
        morphs[5] = dom.createMorphAt(element2, 1, 1);
        morphs[6] = dom.createElementMorph(element3);
        morphs[7] = dom.createMorphAt(element3, 1, 1);
        morphs[8] = dom.createMorphAt(fragment, 6, 6, contextualElement);
        morphs[9] = dom.createMorphAt(dom.childAt(fragment, [8]), 1, 1);
        return morphs;
      },
      statements: [["inline", "t", ["diary.title"], [], ["loc", [null, [4, 4], [4, 23]]]], ["inline", "t", ["diary.subtitle"], [], ["loc", [null, [5, 28], [5, 50]]]], ["inline", "textarea", [], ["value", ["subexpr", "@mut", [["get", "diaryInput", ["loc", [null, [11, 21], [11, 31]]]]], [], []]], ["loc", [null, [11, 4], [11, 33]]]], ["attribute", "class", ["concat", ["ui primary button ", ["subexpr", "if", [["get", "diaryInputIsEmpty", ["loc", [null, [14, 40], [14, 57]]]], "disabled"], [], ["loc", [null, [14, 35], [14, 70]]]]]]], ["element", "action", ["save"], [], ["loc", [null, [14, 72], [14, 89]]]], ["inline", "t", ["action.save"], [], ["loc", [null, [15, 4], [15, 23]]]], ["element", "action", ["cancel"], [], ["loc", [null, [17, 28], [17, 47]]]], ["inline", "t", ["action.cancel"], [], ["loc", [null, [18, 4], [18, 25]]]], ["block", "if", [["get", "pagedContent", ["loc", [null, [24, 6], [24, 18]]]]], [], 0, null, ["loc", [null, [24, 0], [28, 7]]]], ["block", "each", [["get", "pagedContent", ["loc", [null, [31, 10], [31, 22]]]]], [], 1, 2, ["loc", [null, [31, 2], [35, 11]]]]],
      locals: [],
      templates: [child0, child1, child2]
    };
  })());
});
define("rose/templates/extracts", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 9,
              "column": 0
            },
            "end": {
              "line": 13,
              "column": 0
            }
          },
          "moduleName": "rose/templates/extracts.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "page-numbers", [], ["content", ["subexpr", "@mut", [["get", "pagedContent", ["loc", [null, [10, 26], [10, 38]]]]], [], []], "numPagesToShow", 5, "showFL", true], ["loc", [null, [10, 2], [12, 31]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 17,
                "column": 4
              },
              "end": {
                "line": 19,
                "column": 4
              }
            },
            "moduleName": "rose/templates/extracts.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("    ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
            return morphs;
          },
          statements: [["inline", "rose-extract", [], ["model", ["subexpr", "@mut", [["get", "extract", ["loc", [null, [18, 25], [18, 32]]]]], [], []]], ["loc", [null, [18, 4], [18, 34]]]]],
          locals: [],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 16,
              "column": 2
            },
            "end": {
              "line": 20,
              "column": 2
            }
          },
          "moduleName": "rose/templates/extracts.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "unless", [["get", "interaction.isDeleted", ["loc", [null, [17, 14], [17, 35]]]]], [], 0, null, ["loc", [null, [17, 4], [19, 15]]]]],
        locals: ["extract"],
        templates: [child0]
      };
    })();
    var child2 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 20,
              "column": 2
            },
            "end": {
              "line": 22,
              "column": 2
            }
          },
          "moduleName": "rose/templates/extracts.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["content", "no-data-message", ["loc", [null, [21, 4], [21, 23]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 24,
            "column": 0
          }
        },
        "moduleName": "rose/templates/extracts.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "settings icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui comments");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0, 3]);
        var morphs = new Array(4);
        morphs[0] = dom.createMorphAt(element0, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element0, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(fragment, 2, 2, contextualElement);
        morphs[3] = dom.createMorphAt(dom.childAt(fragment, [4]), 1, 1);
        return morphs;
      },
      statements: [["inline", "t", ["extracts.title"], [], ["loc", [null, [4, 4], [4, 26]]]], ["inline", "t", ["extracts.subtitle"], [], ["loc", [null, [5, 28], [5, 53]]]], ["block", "if", [["get", "pagedContent", ["loc", [null, [9, 6], [9, 18]]]]], [], 0, null, ["loc", [null, [9, 0], [13, 7]]]], ["block", "each", [["get", "pagedContent", ["loc", [null, [16, 10], [16, 22]]]]], [], 1, 2, ["loc", [null, [16, 2], [22, 11]]]]],
      locals: [],
      templates: [child0, child1, child2]
    };
  })());
});
define("rose/templates/help", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 32,
            "column": 0
          }
        },
        "moduleName": "rose/templates/help.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "question icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("h4");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("h4");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("h4");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("h4");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("h4");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("h4");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("h4");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("h4");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0, 3]);
        var morphs = new Array(18);
        morphs[0] = dom.createMorphAt(element0, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element0, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(dom.childAt(fragment, [2]), 0, 0);
        morphs[3] = dom.createUnsafeMorphAt(fragment, 4, 4, contextualElement);
        morphs[4] = dom.createMorphAt(dom.childAt(fragment, [6]), 0, 0);
        morphs[5] = dom.createUnsafeMorphAt(fragment, 8, 8, contextualElement);
        morphs[6] = dom.createMorphAt(dom.childAt(fragment, [10]), 0, 0);
        morphs[7] = dom.createUnsafeMorphAt(fragment, 12, 12, contextualElement);
        morphs[8] = dom.createMorphAt(dom.childAt(fragment, [14]), 0, 0);
        morphs[9] = dom.createUnsafeMorphAt(fragment, 16, 16, contextualElement);
        morphs[10] = dom.createMorphAt(dom.childAt(fragment, [18]), 0, 0);
        morphs[11] = dom.createUnsafeMorphAt(fragment, 20, 20, contextualElement);
        morphs[12] = dom.createMorphAt(dom.childAt(fragment, [22]), 0, 0);
        morphs[13] = dom.createUnsafeMorphAt(fragment, 24, 24, contextualElement);
        morphs[14] = dom.createMorphAt(dom.childAt(fragment, [26]), 0, 0);
        morphs[15] = dom.createUnsafeMorphAt(fragment, 28, 28, contextualElement);
        morphs[16] = dom.createMorphAt(dom.childAt(fragment, [30]), 0, 0);
        morphs[17] = dom.createUnsafeMorphAt(fragment, 32, 32, contextualElement);
        return morphs;
      },
      statements: [["inline", "t", ["help.title"], [], ["loc", [null, [4, 4], [4, 22]]]], ["inline", "t", ["help.subtitle"], [], ["loc", [null, [5, 28], [5, 49]]]], ["inline", "t", ["help.issue1.question"], [], ["loc", [null, [9, 4], [9, 32]]]], ["inline", "t", ["help.issue1.answer"], [], ["loc", [null, [10, 0], [10, 28]]]], ["inline", "t", ["help.issue2.question"], [], ["loc", [null, [12, 4], [12, 32]]]], ["inline", "t", ["help.issue2.answer"], [], ["loc", [null, [13, 0], [13, 28]]]], ["inline", "t", ["help.issue3.question"], [], ["loc", [null, [15, 4], [15, 32]]]], ["inline", "t", ["help.issue3.answer"], [], ["loc", [null, [16, 0], [16, 28]]]], ["inline", "t", ["help.issue4.question"], [], ["loc", [null, [18, 4], [18, 32]]]], ["inline", "t", ["help.issue4.answer"], [], ["loc", [null, [19, 0], [19, 28]]]], ["inline", "t", ["help.issue5.question"], [], ["loc", [null, [21, 4], [21, 32]]]], ["inline", "t", ["help.issue5.answer"], [], ["loc", [null, [22, 0], [22, 28]]]], ["inline", "t", ["help.issue6.question"], [], ["loc", [null, [24, 4], [24, 32]]]], ["inline", "t", ["help.issue6.answer"], [], ["loc", [null, [25, 0], [25, 28]]]], ["inline", "t", ["help.issue7.question"], [], ["loc", [null, [27, 4], [27, 32]]]], ["inline", "t", ["help.issue7.answer"], [], ["loc", [null, [28, 0], [28, 28]]]], ["inline", "t", ["help.issue8.question"], [], ["loc", [null, [30, 4], [30, 32]]]], ["inline", "t", ["help.issue8.answer"], [], ["loc", [null, [31, 0], [31, 28]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/index", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 6,
            "column": 0
          }
        },
        "moduleName": "rose/templates/index.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(5);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        morphs[1] = dom.createMorphAt(fragment, 2, 2, contextualElement);
        morphs[2] = dom.createMorphAt(fragment, 4, 4, contextualElement);
        morphs[3] = dom.createMorphAt(fragment, 6, 6, contextualElement);
        morphs[4] = dom.createMorphAt(fragment, 8, 8, contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [["inline", "high-charts", [], ["mode", "StockChart", "content", ["subexpr", "@mut", [["get", "clickChartData", ["loc", [null, [1, 40], [1, 54]]]]], [], []], "chartOptions", ["subexpr", "@mut", [["get", "clickChartOptions", ["loc", [null, [1, 68], [1, 85]]]]], [], []]], ["loc", [null, [1, 0], [1, 87]]]], ["inline", "high-charts", [], ["mode", "StockChart", "content", ["subexpr", "@mut", [["get", "mouseMoveChartData", ["loc", [null, [2, 40], [2, 58]]]]], [], []], "chartOptions", ["subexpr", "@mut", [["get", "mouseMoveChartOptions", ["loc", [null, [2, 72], [2, 93]]]]], [], []]], ["loc", [null, [2, 0], [2, 95]]]], ["inline", "high-charts", [], ["mode", "StockChart", "content", ["subexpr", "@mut", [["get", "scrollChartData", ["loc", [null, [3, 40], [3, 55]]]]], [], []], "chartOptions", ["subexpr", "@mut", [["get", "scrollChartOptions", ["loc", [null, [3, 69], [3, 87]]]]], [], []]], ["loc", [null, [3, 0], [3, 89]]]], ["inline", "high-charts", [], ["mode", "StockChart", "content", ["subexpr", "@mut", [["get", "windowChartData", ["loc", [null, [4, 40], [4, 55]]]]], [], []], "chartOptions", ["subexpr", "@mut", [["get", "windowChartOptions", ["loc", [null, [4, 69], [4, 87]]]]], [], []]], ["loc", [null, [4, 0], [4, 89]]]], ["inline", "high-charts", [], ["mode", "StockChart", "content", ["subexpr", "@mut", [["get", "loginChartData", ["loc", [null, [5, 40], [5, 54]]]]], [], []], "chartOptions", ["subexpr", "@mut", [["get", "loginChartOptions", ["loc", [null, [5, 68], [5, 85]]]]], [], []]], ["loc", [null, [5, 0], [5, 87]]]]],
      locals: [],
      templates: []
    };
  })());
});
define("rose/templates/interactions", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 9,
              "column": 0
            },
            "end": {
              "line": 13,
              "column": 0
            }
          },
          "moduleName": "rose/templates/interactions.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "page-numbers", [], ["content", ["subexpr", "@mut", [["get", "pagedContent", ["loc", [null, [10, 26], [10, 38]]]]], [], []], "numPagesToShow", 5, "showFL", true], ["loc", [null, [10, 2], [12, 31]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 17,
                "column": 4
              },
              "end": {
                "line": 19,
                "column": 4
              }
            },
            "moduleName": "rose/templates/interactions.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("    ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
            return morphs;
          },
          statements: [["inline", "rose-interaction", [], ["model", ["subexpr", "@mut", [["get", "interaction", ["loc", [null, [18, 29], [18, 40]]]]], [], []]], ["loc", [null, [18, 4], [18, 42]]]]],
          locals: [],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 16,
              "column": 2
            },
            "end": {
              "line": 20,
              "column": 2
            }
          },
          "moduleName": "rose/templates/interactions.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [["block", "unless", [["get", "interaction.isDeleted", ["loc", [null, [17, 14], [17, 35]]]]], [], 0, null, ["loc", [null, [17, 4], [19, 15]]]]],
        locals: ["interaction"],
        templates: [child0]
      };
    })();
    var child2 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 20,
              "column": 2
            },
            "end": {
              "line": 22,
              "column": 2
            }
          },
          "moduleName": "rose/templates/interactions.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["content", "no-data-message", ["loc", [null, [21, 4], [21, 23]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 24,
            "column": 0
          }
        },
        "moduleName": "rose/templates/interactions.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "settings icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui comments");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0, 3]);
        var morphs = new Array(4);
        morphs[0] = dom.createMorphAt(element0, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element0, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(fragment, 2, 2, contextualElement);
        morphs[3] = dom.createMorphAt(dom.childAt(fragment, [4]), 1, 1);
        return morphs;
      },
      statements: [["inline", "t", ["interactions.title"], [], ["loc", [null, [4, 4], [4, 30]]]], ["inline", "t", ["interactions.subtitle"], [], ["loc", [null, [5, 28], [5, 57]]]], ["block", "if", [["get", "pagedContent", ["loc", [null, [9, 6], [9, 18]]]]], [], 0, null, ["loc", [null, [9, 0], [13, 7]]]], ["block", "each", [["get", "pagedContent", ["loc", [null, [16, 10], [16, 22]]]]], [], 1, 2, ["loc", [null, [16, 2], [22, 11]]]]],
      locals: [],
      templates: [child0, child1, child2]
    };
  })());
});
define("rose/templates/modal/reset-config", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 18,
              "column": 0
            }
          },
          "moduleName": "rose/templates/modal/reset-config.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "close icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "header");
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "content");
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("p");
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "actions");
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2, "class", "ui black cancel button");
          var el3 = dom.createTextNode("\n    ");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n  ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2, "class", "ui positive right labeled icon button");
          var el3 = dom.createTextNode("\n    ");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n    ");
          dom.appendChild(el2, el3);
          var el3 = dom.createElement("i");
          dom.setAttribute(el3, "class", "checkmark icon");
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n  ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [6]);
          var morphs = new Array(4);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [2]), 1, 1);
          morphs[1] = dom.createMorphAt(dom.childAt(fragment, [4, 1]), 0, 0);
          morphs[2] = dom.createMorphAt(dom.childAt(element0, [1]), 1, 1);
          morphs[3] = dom.createMorphAt(dom.childAt(element0, [3]), 1, 1);
          return morphs;
        },
        statements: [["inline", "t", ["resetConfigModal.question"], [], ["loc", [null, [4, 2], [4, 35]]]], ["inline", "t", ["resetConfigModal.warning"], [], ["loc", [null, [7, 5], [7, 37]]]], ["inline", "t", ["action.cancel"], [], ["loc", [null, [11, 4], [11, 25]]]], ["inline", "t", ["action.confirm"], [], ["loc", [null, [14, 4], [14, 26]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 19,
            "column": 0
          }
        },
        "moduleName": "rose/templates/modal/reset-config.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["block", "ui-modal", [], ["class", "reset-config", "onApprove", ["subexpr", "action", ["approveModal"], [], ["loc", [null, [1, 43], [1, 66]]]]], 0, null, ["loc", [null, [1, 0], [18, 13]]]]],
      locals: [],
      templates: [child0]
    };
  })());
});
define("rose/templates/modal/reset-data", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 17,
              "column": 0
            }
          },
          "moduleName": "rose/templates/modal/reset-data.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "close icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "header");
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "content");
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "actions");
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2, "class", "ui black button");
          var el3 = dom.createTextNode("\n    ");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n  ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2, "class", "ui positive button");
          var el3 = dom.createTextNode("\n    ");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n  ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [6]);
          var morphs = new Array(4);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [2]), 1, 1);
          morphs[1] = dom.createMorphAt(dom.childAt(fragment, [4]), 1, 1);
          morphs[2] = dom.createMorphAt(dom.childAt(element0, [1]), 1, 1);
          morphs[3] = dom.createMorphAt(dom.childAt(element0, [3]), 1, 1);
          return morphs;
        },
        statements: [["inline", "t", ["resetDataModal.question"], [], ["loc", [null, [4, 2], [4, 33]]]], ["inline", "t", ["resetDataModal.warning"], [], ["loc", [null, [7, 2], [7, 32]]]], ["inline", "t", ["action.cancel"], [], ["loc", [null, [11, 4], [11, 25]]]], ["inline", "t", ["action.confirm"], [], ["loc", [null, [14, 4], [14, 26]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 18,
            "column": 0
          }
        },
        "moduleName": "rose/templates/modal/reset-data.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [["block", "ui-modal", [], ["class", "reset-data", "onApprove", ["subexpr", "action", ["approveModal"], [], ["loc", [null, [1, 41], [1, 64]]]]], 0, null, ["loc", [null, [1, 0], [17, 13]]]]],
      locals: [],
      templates: [child0]
    };
  })());
});
define("rose/templates/settings", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 19,
                "column": 6
              },
              "end": {
                "line": 23,
                "column": 6
              }
            },
            "moduleName": "rose/templates/settings.hbs"
          },
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1, "class", "item");
            var el2 = dom.createTextNode("\n          ");
            dom.appendChild(el1, el2);
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var element2 = dom.childAt(fragment, [1]);
            var morphs = new Array(2);
            morphs[0] = dom.createAttrMorph(element2, 'data-value');
            morphs[1] = dom.createMorphAt(element2, 1, 1);
            return morphs;
          },
          statements: [["attribute", "data-value", ["get", "language.code", ["loc", [null, [20, 39], [20, 52]]]]], ["content", "language.name", ["loc", [null, [21, 10], [21, 27]]]]],
          locals: ["language"],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 13,
              "column": 4
            },
            "end": {
              "line": 25,
              "column": 4
            }
          },
          "moduleName": "rose/templates/settings.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "default text");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "dropdown icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "menu");
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("      ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(2);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 0, 0);
          morphs[1] = dom.createMorphAt(dom.childAt(fragment, [5]), 1, 1);
          return morphs;
        },
        statements: [["inline", "t", ["settings.language"], [], ["loc", [null, [16, 32], [16, 57]]]], ["block", "each", [["get", "availableLanguages", ["loc", [null, [19, 14], [19, 32]]]]], [], 0, null, ["loc", [null, [19, 6], [23, 15]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    var child1 = (function () {
      var child0 = (function () {
        var child0 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 73,
                  "column": 8
                },
                "end": {
                  "line": 77,
                  "column": 8
                }
              },
              "moduleName": "rose/templates/settings.hbs"
            },
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("        ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("div");
              dom.setAttribute(el1, "class", "item");
              var el2 = dom.createTextNode("\n          ");
              dom.appendChild(el1, el2);
              var el2 = dom.createComment("");
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n        ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element0 = dom.childAt(fragment, [1]);
              var morphs = new Array(2);
              morphs[0] = dom.createAttrMorph(element0, 'data-value');
              morphs[1] = dom.createMorphAt(element0, 1, 1);
              return morphs;
            },
            statements: [["attribute", "data-value", ["get", "interval.value", ["loc", [null, [74, 39], [74, 53]]]]], ["inline", "t", [["get", "interval.label", ["loc", [null, [75, 14], [75, 28]]]]], [], ["loc", [null, [75, 10], [75, 30]]]]],
            locals: ["interval"],
            templates: []
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 67,
                "column": 4
              },
              "end": {
                "line": 79,
                "column": 4
              }
            },
            "moduleName": "rose/templates/settings.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("      ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1, "class", "default text");
            var el2 = dom.createTextNode("Select Interval");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n      ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("i");
            dom.setAttribute(el1, "class", "dropdown icon");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n      ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1, "class", "menu");
            var el2 = dom.createTextNode("\n");
            dom.appendChild(el1, el2);
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("      ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(dom.childAt(fragment, [5]), 1, 1);
            return morphs;
          },
          statements: [["block", "each", [["get", "updateIntervals", ["loc", [null, [73, 16], [73, 31]]]]], [], 0, null, ["loc", [null, [73, 8], [77, 17]]]]],
          locals: [],
          templates: [child0]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 62,
              "column": 2
            },
            "end": {
              "line": 81,
              "column": 2
            }
          },
          "moduleName": "rose/templates/settings.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "field");
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("label");
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("p");
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("  ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element1 = dom.childAt(fragment, [1]);
          var morphs = new Array(3);
          morphs[0] = dom.createMorphAt(dom.childAt(element1, [1]), 0, 0);
          morphs[1] = dom.createMorphAt(dom.childAt(element1, [3]), 0, 0);
          morphs[2] = dom.createMorphAt(element1, 5, 5);
          return morphs;
        },
        statements: [["inline", "t", ["settings.autoUpdateInterval"], [], ["loc", [null, [64, 11], [64, 46]]]], ["inline", "t", ["settings.autoUpdateIntervalLabel"], [], ["loc", [null, [65, 7], [65, 47]]]], ["block", "ui-dropdown", [], ["class", "selection", "value", ["subexpr", "@mut", [["get", "settings.system.updateInterval", ["loc", [null, [68, 26], [68, 56]]]]], [], []], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [69, 29], [69, 52]]]]], 0, null, ["loc", [null, [67, 4], [79, 20]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 93,
            "column": 0
          }
        },
        "moduleName": "rose/templates/settings.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "settings icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui form");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("button");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    Last Update: ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("button");
        dom.setAttribute(el3, "class", "ui red button");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element3 = dom.childAt(fragment, [0, 3]);
        var element4 = dom.childAt(fragment, [2]);
        var element5 = dom.childAt(element4, [1]);
        var element6 = dom.childAt(element4, [3]);
        var element7 = dom.childAt(element4, [5]);
        var element8 = dom.childAt(element4, [7]);
        var element9 = dom.childAt(element8, [5]);
        var element10 = dom.childAt(element4, [9]);
        var element11 = dom.childAt(element4, [13]);
        var element12 = dom.childAt(element11, [5]);
        var morphs = new Array(26);
        morphs[0] = dom.createMorphAt(element3, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element3, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(dom.childAt(element5, [1]), 0, 0);
        morphs[3] = dom.createMorphAt(dom.childAt(element5, [3]), 0, 0);
        morphs[4] = dom.createMorphAt(element5, 5, 5);
        morphs[5] = dom.createMorphAt(dom.childAt(element6, [1]), 0, 0);
        morphs[6] = dom.createMorphAt(dom.childAt(element6, [3]), 0, 0);
        morphs[7] = dom.createMorphAt(element6, 5, 5);
        morphs[8] = dom.createMorphAt(dom.childAt(element7, [1]), 0, 0);
        morphs[9] = dom.createMorphAt(dom.childAt(element7, [3]), 0, 0);
        morphs[10] = dom.createMorphAt(element7, 5, 5);
        morphs[11] = dom.createMorphAt(dom.childAt(element8, [1]), 0, 0);
        morphs[12] = dom.createMorphAt(dom.childAt(element8, [3]), 0, 0);
        morphs[13] = dom.createAttrMorph(element9, 'class');
        morphs[14] = dom.createElementMorph(element9);
        morphs[15] = dom.createMorphAt(element9, 0, 0);
        morphs[16] = dom.createMorphAt(element8, 7, 7);
        morphs[17] = dom.createMorphAt(dom.childAt(element10, [1]), 0, 0);
        morphs[18] = dom.createMorphAt(dom.childAt(element10, [3]), 0, 0);
        morphs[19] = dom.createMorphAt(element10, 5, 5);
        morphs[20] = dom.createMorphAt(element4, 11, 11);
        morphs[21] = dom.createMorphAt(dom.childAt(element11, [1]), 0, 0);
        morphs[22] = dom.createMorphAt(dom.childAt(element11, [3]), 0, 0);
        morphs[23] = dom.createElementMorph(element12);
        morphs[24] = dom.createMorphAt(element12, 1, 1);
        morphs[25] = dom.createMorphAt(fragment, 4, 4, contextualElement);
        return morphs;
      },
      statements: [["inline", "t", ["settings.title"], [], ["loc", [null, [4, 4], [4, 26]]]], ["inline", "t", ["settings.subtitle"], [], ["loc", [null, [5, 28], [5, 53]]]], ["inline", "t", ["settings.language"], [], ["loc", [null, [11, 11], [11, 36]]]], ["inline", "t", ["settings.languageLabel"], [], ["loc", [null, [12, 7], [12, 37]]]], ["block", "ui-dropdown", [], ["class", "selection", "value", ["subexpr", "@mut", [["get", "settings.user.currentLanguage", ["loc", [null, [14, 26], [14, 55]]]]], [], []], "onChange", ["subexpr", "action", ["changeI18nLanguage"], [], ["loc", [null, [15, 29], [15, 58]]]]], 0, null, ["loc", [null, [13, 4], [25, 20]]]], ["inline", "t", ["settings.commentReminder"], [], ["loc", [null, [29, 11], [29, 43]]]], ["inline", "t", ["settings.commentReminderLabel"], [], ["loc", [null, [30, 7], [30, 44]]]], ["inline", "ui-checkbox", [], ["class", "toggle", "checked", ["subexpr", "@mut", [["get", "settings.user.commentReminderIsEnabled", ["loc", [null, [32, 26], [32, 64]]]]], [], []], "label", ["subexpr", "boolean-to-yesno", [["get", "settings.user.commentReminderIsEnabled", ["loc", [null, [33, 42], [33, 80]]]]], [], ["loc", [null, [33, 24], [33, 81]]]], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [34, 27], [34, 50]]]]], ["loc", [null, [31, 4], [34, 52]]]], ["inline", "t", ["settings.extraFeatures"], [], ["loc", [null, [38, 11], [38, 41]]]], ["inline", "t", ["settings.extraFeaturesLabel"], [], ["loc", [null, [39, 7], [39, 42]]]], ["inline", "ui-checkbox", [], ["class", "toggle", "checked", ["subexpr", "@mut", [["get", "settings.user.developerModeIsEnabled", ["loc", [null, [41, 26], [41, 62]]]]], [], []], "label", ["subexpr", "boolean-to-yesno", [["get", "settings.user.developerModeIsEnabled", ["loc", [null, [42, 42], [42, 78]]]]], [], ["loc", [null, [42, 24], [42, 79]]]], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [43, 27], [43, 50]]]]], ["loc", [null, [40, 4], [43, 52]]]], ["inline", "t", ["settings.manualUpdate"], [], ["loc", [null, [47, 11], [47, 40]]]], ["inline", "t", ["settings.manualUpdateLabel"], [], ["loc", [null, [48, 7], [48, 41]]]], ["attribute", "class", ["concat", ["ui ", ["subexpr", "if", [["get", "updateInProgress", ["loc", [null, [49, 27], [49, 43]]]], "loading"], [], ["loc", [null, [49, 22], [49, 55]]]], " button"]]], ["element", "action", ["manualUpdate"], [], ["loc", [null, [49, 64], [49, 89]]]], ["inline", "t", ["action.update"], [], ["loc", [null, [49, 90], [49, 111]]]], ["inline", "moment-format", [["get", "settings.system.timestamp", ["loc", [null, [50, 33], [50, 58]]]]], [], ["loc", [null, [50, 17], [50, 60]]]], ["inline", "t", ["settings.autoUpdate"], [], ["loc", [null, [54, 11], [54, 38]]]], ["inline", "t", ["settings.autoUpdateLabel"], [], ["loc", [null, [55, 7], [55, 39]]]], ["inline", "ui-checkbox", [], ["class", "toggle", "checked", ["subexpr", "@mut", [["get", "settings.system.autoUpdateIsEnabled", ["loc", [null, [57, 26], [57, 61]]]]], [], []], "label", ["subexpr", "boolean-to-yesno", [["get", "settings.system.autoUpdateIsEnabled", ["loc", [null, [58, 42], [58, 77]]]]], [], ["loc", [null, [58, 24], [58, 78]]]], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [59, 27], [59, 50]]]]], ["loc", [null, [56, 4], [59, 52]]]], ["block", "if", [["get", "settings.system.autoUpdateIsEnabled", ["loc", [null, [62, 8], [62, 43]]]]], [], 1, null, ["loc", [null, [62, 2], [81, 9]]]], ["inline", "t", ["settings.resetRose"], [], ["loc", [null, [84, 11], [84, 37]]]], ["inline", "t", ["settings.resetRoseLabel"], [], ["loc", [null, [85, 7], [85, 38]]]], ["element", "action", ["openModal", "reset-config"], [], ["loc", [null, [86, 34], [86, 71]]]], ["inline", "t", ["action.reset"], [], ["loc", [null, [87, 6], [87, 26]]]], ["inline", "partial", ["modal/reset-config"], [], ["loc", [null, [92, 0], [92, 32]]]]],
      locals: [],
      templates: [child0, child1]
    };
  })());
});
define("rose/templates/sidebar-menu", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 2,
              "column": 2
            },
            "end": {
              "line": 5,
              "column": 2
            }
          },
          "moduleName": "rose/templates/sidebar-menu.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "dashboard icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "t", ["sidebarMenu.dashboard"], [], ["loc", [null, [3, 4], [3, 33]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 6,
              "column": 2
            },
            "end": {
              "line": 9,
              "column": 2
            }
          },
          "moduleName": "rose/templates/sidebar-menu.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "book icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "t", ["sidebarMenu.diary"], [], ["loc", [null, [7, 4], [7, 29]]]]],
        locals: [],
        templates: []
      };
    })();
    var child2 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 16,
                "column": 6
              },
              "end": {
                "line": 18,
                "column": 6
              }
            },
            "moduleName": "rose/templates/sidebar-menu.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
            return morphs;
          },
          statements: [["inline", "t", ["sidebarMenu.comments"], [], ["loc", [null, [17, 8], [17, 36]]]]],
          locals: [],
          templates: []
        };
      })();
      var child1 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 19,
                "column": 6
              },
              "end": {
                "line": 21,
                "column": 6
              }
            },
            "moduleName": "rose/templates/sidebar-menu.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
            return morphs;
          },
          statements: [["inline", "t", ["sidebarMenu.interactions"], [], ["loc", [null, [20, 8], [20, 40]]]]],
          locals: [],
          templates: []
        };
      })();
      var child2 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 22,
                "column": 6
              },
              "end": {
                "line": 24,
                "column": 6
              }
            },
            "moduleName": "rose/templates/sidebar-menu.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
            return morphs;
          },
          statements: [["inline", "t", ["sidebarMenu.extracts"], [], ["loc", [null, [23, 8], [23, 36]]]]],
          locals: [],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 11,
              "column": 2
            },
            "end": {
              "line": 27,
              "column": 2
            }
          },
          "moduleName": "rose/templates/sidebar-menu.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "item");
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode(" ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("i");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2, "class", "menu");
          var el3 = dom.createTextNode("\n");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("    ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element2 = dom.childAt(fragment, [1]);
          var element3 = dom.childAt(element2, [5]);
          var element4 = dom.childAt(element2, [7]);
          var morphs = new Array(6);
          morphs[0] = dom.createMorphAt(element2, 1, 1);
          morphs[1] = dom.createMorphAt(element2, 3, 3);
          morphs[2] = dom.createAttrMorph(element3, 'class');
          morphs[3] = dom.createMorphAt(element4, 1, 1);
          morphs[4] = dom.createMorphAt(element4, 2, 2);
          morphs[5] = dom.createMorphAt(element4, 3, 3);
          return morphs;
        },
        statements: [["content", "network.descriptiveName", ["loc", [null, [13, 4], [13, 31]]]], ["inline", "t", ["sidebarMenu.data"], [], ["loc", [null, [13, 32], [13, 56]]]], ["attribute", "class", ["concat", [["get", "network.name", ["loc", [null, [14, 16], [14, 28]]]], " icon"]]], ["block", "link-to", ["comments", ["get", "network.name", ["loc", [null, [16, 28], [16, 40]]]]], ["class", "item"], 0, null, ["loc", [null, [16, 6], [18, 18]]]], ["block", "link-to", ["interactions", ["get", "network.name", ["loc", [null, [19, 32], [19, 44]]]]], ["class", "item"], 1, null, ["loc", [null, [19, 6], [21, 18]]]], ["block", "link-to", ["extracts", ["get", "network.name", ["loc", [null, [22, 28], [22, 40]]]]], ["class", "item"], 2, null, ["loc", [null, [22, 6], [24, 18]]]]],
        locals: ["network"],
        templates: [child0, child1, child2]
      };
    })();
    var child3 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 29,
              "column": 2
            },
            "end": {
              "line": 32,
              "column": 2
            }
          },
          "moduleName": "rose/templates/sidebar-menu.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "download icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "t", ["sidebarMenu.backup"], [], ["loc", [null, [30, 4], [30, 30]]]]],
        locals: [],
        templates: []
      };
    })();
    var child4 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 33,
              "column": 2
            },
            "end": {
              "line": 36,
              "column": 2
            }
          },
          "moduleName": "rose/templates/sidebar-menu.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "options icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "t", ["sidebarMenu.settings"], [], ["loc", [null, [34, 4], [34, 32]]]]],
        locals: [],
        templates: []
      };
    })();
    var child5 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 37,
              "column": 2
            },
            "end": {
              "line": 40,
              "column": 2
            }
          },
          "moduleName": "rose/templates/sidebar-menu.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "help circle icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "t", ["sidebarMenu.help"], [], ["loc", [null, [38, 4], [38, 28]]]]],
        locals: [],
        templates: []
      };
    })();
    var child6 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 46,
                "column": 6
              },
              "end": {
                "line": 48,
                "column": 6
              }
            },
            "moduleName": "rose/templates/sidebar-menu.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
            return morphs;
          },
          statements: [["inline", "t", ["sidebarMenu.studyCreator"], [], ["loc", [null, [47, 8], [47, 40]]]]],
          locals: [],
          templates: []
        };
      })();
      var child1 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 49,
                "column": 6
              },
              "end": {
                "line": 51,
                "column": 6
              }
            },
            "moduleName": "rose/templates/sidebar-menu.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
            return morphs;
          },
          statements: [["inline", "t", ["sidebarMenu.debugLog"], [], ["loc", [null, [50, 8], [50, 36]]]]],
          locals: [],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 41,
              "column": 2
            },
            "end": {
              "line": 54,
              "column": 2
            }
          },
          "moduleName": "rose/templates/sidebar-menu.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("  ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "item");
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("i");
          dom.setAttribute(el2, "class", "lab icon");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2, "class", "menu");
          var el3 = dom.createTextNode("\n");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("    ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n  ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element0 = dom.childAt(fragment, [1]);
          var element1 = dom.childAt(element0, [5]);
          var morphs = new Array(3);
          morphs[0] = dom.createMorphAt(element0, 1, 1);
          morphs[1] = dom.createMorphAt(element1, 1, 1);
          morphs[2] = dom.createMorphAt(element1, 2, 2);
          return morphs;
        },
        statements: [["inline", "t", ["sidebarMenu.extraFeatures"], [], ["loc", [null, [43, 4], [43, 37]]]], ["block", "link-to", ["study-creator"], ["class", "item"], 0, null, ["loc", [null, [46, 6], [48, 18]]]], ["block", "link-to", ["debug-log"], ["class", "item"], 1, null, ["loc", [null, [49, 6], [51, 18]]]]],
        locals: [],
        templates: [child0, child1]
      };
    })();
    var child7 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 55,
              "column": 2
            },
            "end": {
              "line": 58,
              "column": 2
            }
          },
          "moduleName": "rose/templates/sidebar-menu.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "info circle icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [["inline", "t", ["sidebarMenu.about"], [], ["loc", [null, [56, 4], [56, 29]]]]],
        locals: [],
        templates: []
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 60,
            "column": 0
          }
        },
        "moduleName": "rose/templates/sidebar-menu.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui vertical menu");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element5 = dom.childAt(fragment, [0]);
        var morphs = new Array(8);
        morphs[0] = dom.createMorphAt(element5, 1, 1);
        morphs[1] = dom.createMorphAt(element5, 2, 2);
        morphs[2] = dom.createMorphAt(element5, 4, 4);
        morphs[3] = dom.createMorphAt(element5, 6, 6);
        morphs[4] = dom.createMorphAt(element5, 7, 7);
        morphs[5] = dom.createMorphAt(element5, 8, 8);
        morphs[6] = dom.createMorphAt(element5, 9, 9);
        morphs[7] = dom.createMorphAt(element5, 10, 10);
        return morphs;
      },
      statements: [["block", "link-to", ["index"], ["class", "item"], 0, null, ["loc", [null, [2, 2], [5, 14]]]], ["block", "link-to", ["diary"], ["class", "item"], 1, null, ["loc", [null, [6, 2], [9, 14]]]], ["block", "each", [["get", "networks", ["loc", [null, [11, 10], [11, 18]]]]], [], 2, null, ["loc", [null, [11, 2], [27, 11]]]], ["block", "link-to", ["backup"], ["class", "item"], 3, null, ["loc", [null, [29, 2], [32, 14]]]], ["block", "link-to", ["settings"], ["class", "item"], 4, null, ["loc", [null, [33, 2], [36, 14]]]], ["block", "link-to", ["help"], ["class", "item"], 5, null, ["loc", [null, [37, 2], [40, 14]]]], ["block", "if", [["get", "settings.user.developerModeIsEnabled", ["loc", [null, [41, 8], [41, 44]]]]], [], 6, null, ["loc", [null, [41, 2], [54, 9]]]], ["block", "link-to", ["about"], ["class", "item"], 7, null, ["loc", [null, [55, 2], [58, 14]]]]],
      locals: [],
      templates: [child0, child1, child2, child3, child4, child5, child6, child7]
    };
  })());
});
define("rose/templates/study-creator", ["exports"], function (exports) {
  exports["default"] = Ember.HTMLBars.template((function () {
    var child0 = (function () {
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 68,
              "column": 4
            },
            "end": {
              "line": 72,
              "column": 4
            }
          },
          "moduleName": "rose/templates/study-creator.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "ui pointing red basic label");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 1, 1);
          return morphs;
        },
        statements: [["inline", "t", ["studyCreator.baseFileNotFound"], [], ["loc", [null, [70, 6], [70, 43]]]]],
        locals: [],
        templates: []
      };
    })();
    var child1 = (function () {
      var child0 = (function () {
        var child0 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 124,
                  "column": 12
                },
                "end": {
                  "line": 132,
                  "column": 12
                }
              },
              "moduleName": "rose/templates/study-creator.hbs"
            },
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("              ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("tr");
              var el2 = dom.createTextNode("\n                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2, "class", "collapsing");
              var el3 = dom.createTextNode("\n                  ");
              dom.appendChild(el2, el3);
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n                ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              var el3 = dom.createElement("strong");
              var el4 = dom.createComment("");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n              ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element2 = dom.childAt(fragment, [1]);
              var morphs = new Array(3);
              morphs[0] = dom.createMorphAt(dom.childAt(element2, [1]), 1, 1);
              morphs[1] = dom.createMorphAt(dom.childAt(element2, [3, 0]), 0, 0);
              morphs[2] = dom.createMorphAt(dom.childAt(element2, [5]), 0, 0);
              return morphs;
            },
            statements: [["inline", "ui-checkbox", [], ["class", "fitted toggle", "checked", ["subexpr", "@mut", [["get", "extractor.isEnabled", ["loc", [null, [127, 62], [127, 81]]]]], [], []]], ["loc", [null, [127, 18], [127, 83]]]], ["content", "extractor.name", ["loc", [null, [129, 28], [129, 46]]]], ["content", "extractor.version", ["loc", [null, [130, 20], [130, 41]]]]],
            locals: ["extractor"],
            templates: []
          };
        })();
        var child1 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 147,
                  "column": 12
                },
                "end": {
                  "line": 149,
                  "column": 12
                }
              },
              "moduleName": "rose/templates/study-creator.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("            ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("div");
              dom.setAttribute(el1, "class", "ui green small horizontal label");
              dom.setAttribute(el1, "style", "margin-left: 20px;");
              var el2 = dom.createComment("");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 0, 0);
              return morphs;
            },
            statements: [["inline", "t", ["studyCreator.secure"], [], ["loc", [null, [148, 84], [148, 111]]]]],
            locals: [],
            templates: []
          };
        })();
        var child2 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 149,
                  "column": 12
                },
                "end": {
                  "line": 151,
                  "column": 12
                }
              },
              "moduleName": "rose/templates/study-creator.hbs"
            },
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("            ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("div");
              dom.setAttribute(el1, "class", "ui small horizontal label");
              dom.setAttribute(el1, "style", "margin-left: 20px;");
              var el2 = dom.createComment("");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]), 0, 0);
              return morphs;
            },
            statements: [["inline", "t", ["studyCreator.unknown"], [], ["loc", [null, [150, 78], [150, 106]]]]],
            locals: [],
            templates: []
          };
        })();
        var child3 = (function () {
          return {
            meta: {
              "revision": "Ember@1.13.12",
              "loc": {
                "source": null,
                "start": {
                  "line": 164,
                  "column": 12
                },
                "end": {
                  "line": 174,
                  "column": 12
                }
              },
              "moduleName": "rose/templates/study-creator.hbs"
            },
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("              ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("tr");
              var el2 = dom.createTextNode("\n                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2, "class", "collapsing");
              var el3 = dom.createTextNode("\n                  ");
              dom.appendChild(el2, el3);
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n                ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              var el3 = dom.createElement("strong");
              var el4 = dom.createComment("");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n              ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element1 = dom.childAt(fragment, [1]);
              var morphs = new Array(5);
              morphs[0] = dom.createMorphAt(dom.childAt(element1, [1]), 1, 1);
              morphs[1] = dom.createMorphAt(dom.childAt(element1, [3, 0]), 0, 0);
              morphs[2] = dom.createMorphAt(dom.childAt(element1, [5]), 0, 0);
              morphs[3] = dom.createMorphAt(dom.childAt(element1, [7]), 0, 0);
              morphs[4] = dom.createMorphAt(dom.childAt(element1, [9]), 0, 0);
              return morphs;
            },
            statements: [["inline", "ui-checkbox", [], ["class", "fitted toggle", "checked", ["subexpr", "@mut", [["get", "observer.isEnabled", ["loc", [null, [167, 62], [167, 80]]]]], [], []]], ["loc", [null, [167, 18], [167, 82]]]], ["content", "observer.name", ["loc", [null, [169, 28], [169, 45]]]], ["content", "observer.description", ["loc", [null, [170, 20], [170, 44]]]], ["content", "observer.type", ["loc", [null, [171, 20], [171, 37]]]], ["content", "observer.version", ["loc", [null, [172, 20], [172, 40]]]]],
            locals: ["observer"],
            templates: []
          };
        })();
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 109,
                "column": 8
              },
              "end": {
                "line": 186,
                "column": 6
              }
            },
            "moduleName": "rose/templates/study-creator.hbs"
          },
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1, "class", "ui field");
            dom.setAttribute(el1, "style", "padding-top: 15px;");
            var el2 = dom.createTextNode("\n          ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("label");
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            var el3 = dom.createComment("");
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3, "class", "ui green small horizontal label");
            dom.setAttribute(el3, "style", "margin-left: 20px;");
            var el4 = dom.createComment("");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n          ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n          ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("table");
            dom.setAttribute(el2, "class", "ui small compact table");
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("thead");
            dom.setAttribute(el3, "class", "full-width");
            var el4 = dom.createTextNode("\n              ");
            dom.appendChild(el3, el4);
            var el4 = dom.createElement("tr");
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            var el6 = dom.createComment("");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            var el6 = dom.createComment("");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            var el6 = dom.createComment("");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n              ");
            dom.appendChild(el4, el5);
            dom.appendChild(el3, el4);
            var el4 = dom.createTextNode("\n            ");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("tbody");
            var el4 = dom.createTextNode("\n");
            dom.appendChild(el3, el4);
            var el4 = dom.createComment("");
            dom.appendChild(el3, el4);
            var el4 = dom.createTextNode("            ");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("tfoot");
            dom.setAttribute(el3, "class", "full-width");
            var el4 = dom.createTextNode("\n              ");
            dom.appendChild(el3, el4);
            var el4 = dom.createElement("tr");
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            dom.setAttribute(el5, "colspan", "3");
            var el6 = dom.createTextNode("\n                  ");
            dom.appendChild(el5, el6);
            var el6 = dom.createElement("button");
            dom.setAttribute(el6, "class", "ui small green button");
            var el7 = dom.createComment("");
            dom.appendChild(el6, el7);
            dom.appendChild(el5, el6);
            var el6 = dom.createTextNode("\n                  ");
            dom.appendChild(el5, el6);
            var el6 = dom.createElement("button");
            dom.setAttribute(el6, "class", "ui small basic button");
            var el7 = dom.createComment("");
            dom.appendChild(el6, el7);
            dom.appendChild(el5, el6);
            var el6 = dom.createTextNode("\n                ");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n              ");
            dom.appendChild(el4, el5);
            dom.appendChild(el3, el4);
            var el4 = dom.createTextNode("\n            ");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n          ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1, "class", "ui field");
            var el2 = dom.createTextNode("\n          ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("label");
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            var el3 = dom.createComment("");
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n");
            dom.appendChild(el2, el3);
            var el3 = dom.createComment("");
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("          ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n          ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("table");
            dom.setAttribute(el2, "class", "ui small compact table");
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("thead");
            dom.setAttribute(el3, "class", "full-width");
            var el4 = dom.createTextNode("\n              ");
            dom.appendChild(el3, el4);
            var el4 = dom.createElement("tr");
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            var el6 = dom.createComment("");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            var el6 = dom.createComment("");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            var el6 = dom.createComment("");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            var el6 = dom.createComment("");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            var el6 = dom.createComment("");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n              ");
            dom.appendChild(el4, el5);
            dom.appendChild(el3, el4);
            var el4 = dom.createTextNode("\n            ");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("tbody");
            var el4 = dom.createTextNode("\n");
            dom.appendChild(el3, el4);
            var el4 = dom.createComment("");
            dom.appendChild(el3, el4);
            var el4 = dom.createTextNode("            ");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("tfoot");
            dom.setAttribute(el3, "class", "full-width");
            var el4 = dom.createTextNode("\n              ");
            dom.appendChild(el3, el4);
            var el4 = dom.createElement("tr");
            var el5 = dom.createTextNode("\n                ");
            dom.appendChild(el4, el5);
            var el5 = dom.createElement("th");
            dom.setAttribute(el5, "colspan", "5");
            var el6 = dom.createTextNode("\n                  ");
            dom.appendChild(el5, el6);
            var el6 = dom.createElement("button");
            dom.setAttribute(el6, "class", "ui small green button");
            var el7 = dom.createComment("");
            dom.appendChild(el6, el7);
            dom.appendChild(el5, el6);
            var el6 = dom.createTextNode("\n                  ");
            dom.appendChild(el5, el6);
            var el6 = dom.createElement("button");
            dom.setAttribute(el6, "class", "ui small basic button");
            var el7 = dom.createComment("");
            dom.appendChild(el6, el7);
            dom.appendChild(el5, el6);
            var el6 = dom.createTextNode("\n                ");
            dom.appendChild(el5, el6);
            dom.appendChild(el4, el5);
            var el5 = dom.createTextNode("\n              ");
            dom.appendChild(el4, el5);
            dom.appendChild(el3, el4);
            var el4 = dom.createTextNode("\n            ");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n          ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var element3 = dom.childAt(fragment, [1]);
            var element4 = dom.childAt(element3, [1]);
            var element5 = dom.childAt(element3, [3]);
            var element6 = dom.childAt(element5, [1, 1]);
            var element7 = dom.childAt(element5, [5, 1, 1]);
            var element8 = dom.childAt(element7, [1]);
            var element9 = dom.childAt(element7, [3]);
            var element10 = dom.childAt(fragment, [3]);
            var element11 = dom.childAt(element10, [1]);
            var element12 = dom.childAt(element10, [3]);
            var element13 = dom.childAt(element12, [1, 1]);
            var element14 = dom.childAt(element12, [5, 1, 1]);
            var element15 = dom.childAt(element14, [1]);
            var element16 = dom.childAt(element14, [3]);
            var morphs = new Array(22);
            morphs[0] = dom.createMorphAt(element4, 1, 1);
            morphs[1] = dom.createMorphAt(dom.childAt(element4, [3]), 0, 0);
            morphs[2] = dom.createMorphAt(dom.childAt(element6, [1]), 0, 0);
            morphs[3] = dom.createMorphAt(dom.childAt(element6, [3]), 0, 0);
            morphs[4] = dom.createMorphAt(dom.childAt(element6, [5]), 0, 0);
            morphs[5] = dom.createMorphAt(dom.childAt(element5, [3]), 1, 1);
            morphs[6] = dom.createElementMorph(element8);
            morphs[7] = dom.createMorphAt(element8, 0, 0);
            morphs[8] = dom.createElementMorph(element9);
            morphs[9] = dom.createMorphAt(element9, 0, 0);
            morphs[10] = dom.createMorphAt(element11, 1, 1);
            morphs[11] = dom.createMorphAt(element11, 3, 3);
            morphs[12] = dom.createMorphAt(dom.childAt(element13, [1]), 0, 0);
            morphs[13] = dom.createMorphAt(dom.childAt(element13, [3]), 0, 0);
            morphs[14] = dom.createMorphAt(dom.childAt(element13, [5]), 0, 0);
            morphs[15] = dom.createMorphAt(dom.childAt(element13, [7]), 0, 0);
            morphs[16] = dom.createMorphAt(dom.childAt(element13, [9]), 0, 0);
            morphs[17] = dom.createMorphAt(dom.childAt(element12, [3]), 1, 1);
            morphs[18] = dom.createElementMorph(element15);
            morphs[19] = dom.createMorphAt(element15, 0, 0);
            morphs[20] = dom.createElementMorph(element16);
            morphs[21] = dom.createMorphAt(element16, 0, 0);
            return morphs;
          },
          statements: [["inline", "t", ["studyCreator.extractors"], [], ["loc", [null, [112, 12], [112, 43]]]], ["inline", "t", ["studyCreator.secure"], [], ["loc", [null, [113, 84], [113, 111]]]], ["inline", "t", ["studyCreator.table.enabled"], [], ["loc", [null, [118, 20], [118, 54]]]], ["inline", "t", ["studyCreator.table.name"], [], ["loc", [null, [119, 20], [119, 51]]]], ["inline", "t", ["studyCreator.table.version"], [], ["loc", [null, [120, 20], [120, 54]]]], ["block", "each", [["get", "network.extractors", ["loc", [null, [124, 20], [124, 38]]]]], [], 0, null, ["loc", [null, [124, 12], [132, 21]]]], ["element", "action", ["enableAll", ["get", "network.extractors", ["loc", [null, [137, 77], [137, 95]]]]], [], ["loc", [null, [137, 56], [137, 97]]]], ["inline", "t", ["studyCreator.enableAll"], [], ["loc", [null, [137, 98], [137, 128]]]], ["element", "action", ["disableAll", ["get", "network.extractors", ["loc", [null, [138, 78], [138, 96]]]]], [], ["loc", [null, [138, 56], [138, 98]]]], ["inline", "t", ["studyCreator.disableAll"], [], ["loc", [null, [138, 99], [138, 130]]]], ["inline", "t", ["studyCreator.observers"], [], ["loc", [null, [146, 12], [146, 42]]]], ["block", "if", [["get", "model.fingerprint", ["loc", [null, [147, 18], [147, 35]]]]], [], 1, 2, ["loc", [null, [147, 12], [151, 19]]]], ["inline", "t", ["studyCreator.table.enabled"], [], ["loc", [null, [156, 20], [156, 54]]]], ["inline", "t", ["studyCreator.table.name"], [], ["loc", [null, [157, 20], [157, 51]]]], ["inline", "t", ["studyCreator.table.description"], [], ["loc", [null, [158, 20], [158, 58]]]], ["inline", "t", ["studyCreator.table.type"], [], ["loc", [null, [159, 20], [159, 51]]]], ["inline", "t", ["studyCreator.table.version"], [], ["loc", [null, [160, 20], [160, 54]]]], ["block", "each", [["get", "network.observers", ["loc", [null, [164, 20], [164, 37]]]]], [], 3, null, ["loc", [null, [164, 12], [174, 21]]]], ["element", "action", ["enableAll", ["get", "network.observers", ["loc", [null, [179, 77], [179, 94]]]]], [], ["loc", [null, [179, 56], [179, 96]]]], ["inline", "t", ["studyCreator.enableAll"], [], ["loc", [null, [179, 97], [179, 127]]]], ["element", "action", ["disableAll", ["get", "network.observers", ["loc", [null, [180, 78], [180, 95]]]]], [], ["loc", [null, [180, 56], [180, 97]]]], ["inline", "t", ["studyCreator.disableAll"], [], ["loc", [null, [180, 98], [180, 129]]]]],
          locals: [],
          templates: [child0, child1, child2, child3]
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 103,
              "column": 4
            },
            "end": {
              "line": 188,
              "column": 4
            }
          },
          "moduleName": "rose/templates/study-creator.hbs"
        },
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "field");
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("      ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element17 = dom.childAt(fragment, [1]);
          var morphs = new Array(2);
          morphs[0] = dom.createMorphAt(element17, 1, 1);
          morphs[1] = dom.createMorphAt(element17, 3, 3);
          return morphs;
        },
        statements: [["inline", "ui-checkbox", [], ["checked", ["subexpr", "@mut", [["get", "network.isEnabled", ["loc", [null, [105, 30], [105, 47]]]]], [], []], "class", "toggle", "label", ["subexpr", "@mut", [["get", "network.descriptiveName", ["loc", [null, [107, 28], [107, 51]]]]], [], []], "value", ["subexpr", "@mut", [["get", "network", ["loc", [null, [108, 28], [108, 35]]]]], [], []]], ["loc", [null, [105, 8], [108, 37]]]], ["block", "if", [["get", "network.isEnabled", ["loc", [null, [109, 14], [109, 31]]]]], [], 0, null, ["loc", [null, [109, 8], [186, 13]]]]],
        locals: ["network"],
        templates: [child0]
      };
    })();
    var child2 = (function () {
      var child0 = (function () {
        return {
          meta: {
            "revision": "Ember@1.13.12",
            "loc": {
              "source": null,
              "start": {
                "line": 222,
                "column": 8
              },
              "end": {
                "line": 226,
                "column": 8
              }
            },
            "moduleName": "rose/templates/study-creator.hbs"
          },
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1, "class", "item");
            var el2 = dom.createTextNode("\n          ");
            dom.appendChild(el1, el2);
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var element0 = dom.childAt(fragment, [1]);
            var morphs = new Array(2);
            morphs[0] = dom.createAttrMorph(element0, 'data-value');
            morphs[1] = dom.createMorphAt(element0, 1, 1);
            return morphs;
          },
          statements: [["attribute", "data-value", ["get", "interval.value", ["loc", [null, [223, 39], [223, 53]]]]], ["inline", "t", [["get", "interval.label", ["loc", [null, [224, 14], [224, 28]]]]], [], ["loc", [null, [224, 10], [224, 30]]]]],
          locals: ["interval"],
          templates: []
        };
      })();
      return {
        meta: {
          "revision": "Ember@1.13.12",
          "loc": {
            "source": null,
            "start": {
              "line": 216,
              "column": 4
            },
            "end": {
              "line": 228,
              "column": 4
            }
          },
          "moduleName": "rose/templates/study-creator.hbs"
        },
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "default text");
          var el2 = dom.createTextNode("Select Interval");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("i");
          dom.setAttribute(el1, "class", "dropdown icon");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1, "class", "menu");
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("      ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [5]), 1, 1);
          return morphs;
        },
        statements: [["block", "each", [["get", "updateIntervals", ["loc", [null, [222, 16], [222, 31]]]]], [], 0, null, ["loc", [null, [222, 8], [226, 17]]]]],
        locals: [],
        templates: [child0]
      };
    })();
    return {
      meta: {
        "revision": "Ember@1.13.12",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 244,
            "column": 0
          }
        },
        "moduleName": "rose/templates/study-creator.hbs"
      },
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h2");
        dom.setAttribute(el1, "class", "ui dividing header");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("i");
        dom.setAttribute(el2, "class", "lab icon");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "content");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "sub header");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1, "class", "ui form");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("h3");
        dom.setAttribute(el2, "class", "ui dividing header");
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("h3");
        dom.setAttribute(el2, "class", "ui dividing header");
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("h3");
        dom.setAttribute(el2, "class", "ui dividing header");
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "ui action input");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("button");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("i");
        dom.setAttribute(el5, "class", "search icon");
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3, "class", "ui input");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("h3");
        dom.setAttribute(el2, "class", "ui dividing header");
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("h3");
        dom.setAttribute(el2, "class", "ui dividing header");
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2, "class", "field");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("label");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("p");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("button");
        dom.setAttribute(el2, "class", "ui primary button");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element18 = dom.childAt(fragment, [0, 3]);
        var element19 = dom.childAt(fragment, [2]);
        var element20 = dom.childAt(element19, [3]);
        var element21 = dom.childAt(element19, [5]);
        var element22 = dom.childAt(element19, [9]);
        var element23 = dom.childAt(element19, [11]);
        var element24 = dom.childAt(element19, [15]);
        var element25 = dom.childAt(element24, [5]);
        var element26 = dom.childAt(element25, [3]);
        var element27 = dom.childAt(element19, [17]);
        var element28 = dom.childAt(element19, [19]);
        var element29 = dom.childAt(element19, [23]);
        var element30 = dom.childAt(element19, [27]);
        var element31 = dom.childAt(element19, [29]);
        var element32 = dom.childAt(element19, [31]);
        var element33 = dom.childAt(element19, [33]);
        var element34 = dom.childAt(element19, [35]);
        var morphs = new Array(48);
        morphs[0] = dom.createMorphAt(element18, 1, 1);
        morphs[1] = dom.createMorphAt(dom.childAt(element18, [3]), 0, 0);
        morphs[2] = dom.createMorphAt(dom.childAt(element19, [1]), 0, 0);
        morphs[3] = dom.createMorphAt(dom.childAt(element20, [1]), 0, 0);
        morphs[4] = dom.createMorphAt(dom.childAt(element20, [3]), 0, 0);
        morphs[5] = dom.createMorphAt(element20, 5, 5);
        morphs[6] = dom.createMorphAt(dom.childAt(element21, [1]), 0, 0);
        morphs[7] = dom.createMorphAt(dom.childAt(element21, [3]), 0, 0);
        morphs[8] = dom.createMorphAt(element21, 5, 5);
        morphs[9] = dom.createMorphAt(dom.childAt(element19, [7]), 0, 0);
        morphs[10] = dom.createMorphAt(dom.childAt(element22, [1]), 0, 0);
        morphs[11] = dom.createMorphAt(dom.childAt(element22, [3]), 0, 0);
        morphs[12] = dom.createMorphAt(element22, 5, 5);
        morphs[13] = dom.createMorphAt(dom.childAt(element23, [1]), 0, 0);
        morphs[14] = dom.createMorphAt(dom.childAt(element23, [3]), 0, 0);
        morphs[15] = dom.createMorphAt(element23, 5, 5);
        morphs[16] = dom.createMorphAt(dom.childAt(element19, [13]), 0, 0);
        morphs[17] = dom.createMorphAt(dom.childAt(element24, [1]), 0, 0);
        morphs[18] = dom.createMorphAt(dom.childAt(element24, [3]), 0, 0);
        morphs[19] = dom.createMorphAt(element25, 1, 1);
        morphs[20] = dom.createAttrMorph(element26, 'class');
        morphs[21] = dom.createElementMorph(element26);
        morphs[22] = dom.createMorphAt(element24, 7, 7);
        morphs[23] = dom.createMorphAt(dom.childAt(element27, [1]), 0, 0);
        morphs[24] = dom.createMorphAt(dom.childAt(element27, [3]), 0, 0);
        morphs[25] = dom.createMorphAt(dom.childAt(element27, [5]), 1, 1);
        morphs[26] = dom.createMorphAt(dom.childAt(element28, [1]), 0, 0);
        morphs[27] = dom.createMorphAt(dom.childAt(element28, [3]), 0, 0);
        morphs[28] = dom.createMorphAt(element28, 5, 5);
        morphs[29] = dom.createMorphAt(dom.childAt(element19, [21]), 0, 0);
        morphs[30] = dom.createMorphAt(dom.childAt(element29, [1]), 0, 0);
        morphs[31] = dom.createMorphAt(dom.childAt(element29, [3]), 0, 0);
        morphs[32] = dom.createMorphAt(element29, 5, 5);
        morphs[33] = dom.createMorphAt(dom.childAt(element19, [25]), 0, 0);
        morphs[34] = dom.createMorphAt(dom.childAt(element30, [1]), 0, 0);
        morphs[35] = dom.createMorphAt(dom.childAt(element30, [3]), 0, 0);
        morphs[36] = dom.createMorphAt(element30, 5, 5);
        morphs[37] = dom.createMorphAt(dom.childAt(element31, [1]), 0, 0);
        morphs[38] = dom.createMorphAt(dom.childAt(element31, [3]), 0, 0);
        morphs[39] = dom.createMorphAt(element31, 5, 5);
        morphs[40] = dom.createMorphAt(dom.childAt(element32, [1]), 0, 0);
        morphs[41] = dom.createMorphAt(dom.childAt(element32, [3]), 0, 0);
        morphs[42] = dom.createMorphAt(element32, 5, 5);
        morphs[43] = dom.createMorphAt(dom.childAt(element33, [1]), 0, 0);
        morphs[44] = dom.createMorphAt(dom.childAt(element33, [3]), 0, 0);
        morphs[45] = dom.createMorphAt(element33, 5, 5);
        morphs[46] = dom.createElementMorph(element34);
        morphs[47] = dom.createMorphAt(element34, 1, 1);
        return morphs;
      },
      statements: [["inline", "t", ["studyCreator.title"], [], ["loc", [null, [4, 4], [4, 30]]]], ["inline", "t", ["studyCreator.subtitle"], [], ["loc", [null, [5, 28], [5, 57]]]], ["inline", "t", ["studyCreator.optionalFeaturesHeader"], [], ["loc", [null, [10, 33], [10, 76]]]], ["inline", "t", ["studyCreator.roseComments"], [], ["loc", [null, [12, 11], [12, 44]]]], ["inline", "t", ["studyCreator.roseCommentsDesc"], [], ["loc", [null, [13, 7], [13, 44]]]], ["inline", "ui-checkbox", [], ["checked", ["subexpr", "@mut", [["get", "model.roseCommentsIsEnabled", ["loc", [null, [15, 26], [15, 53]]]]], [], []], "class", "toggle", "label", ["subexpr", "boolean-to-yesno", [["get", "model.roseCommentsIsEnabled", ["loc", [null, [17, 42], [17, 69]]]]], [], ["loc", [null, [17, 24], [17, 70]]]], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [18, 27], [18, 50]]]]], ["loc", [null, [15, 4], [18, 52]]]], ["inline", "t", ["studyCreator.roseCommentsRating"], [], ["loc", [null, [22, 11], [22, 50]]]], ["inline", "t", ["studyCreator.roseCommentsRatingDesc"], [], ["loc", [null, [23, 7], [23, 50]]]], ["inline", "ui-checkbox", [], ["checked", ["subexpr", "@mut", [["get", "model.roseCommentsRatingIsEnabled", ["loc", [null, [25, 26], [25, 59]]]]], [], []], "class", "toggle", "label", ["subexpr", "boolean-to-yesno", [["get", "model.roseCommentsRatingIsEnabled", ["loc", [null, [27, 42], [27, 75]]]]], [], ["loc", [null, [27, 24], [27, 76]]]], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [28, 27], [28, 50]]]]], ["loc", [null, [25, 4], [28, 52]]]], ["inline", "t", ["studyCreator.privacyHeader"], [], ["loc", [null, [31, 33], [31, 67]]]], ["inline", "t", ["studyCreator.salt"], [], ["loc", [null, [34, 11], [34, 36]]]], ["inline", "t", ["studyCreator.saltDesc"], [], ["loc", [null, [35, 7], [35, 36]]]], ["inline", "input", [], ["type", "text", "value", ["subexpr", "@mut", [["get", "model.salt", ["loc", [null, [38, 18], [38, 28]]]]], [], []], "insert-newline", "saveSettings", "focus-out", "saveSettings"], ["loc", [null, [37, 4], [40, 38]]]], ["inline", "t", ["studyCreator.hashLength"], [], ["loc", [null, [44, 11], [44, 42]]]], ["inline", "t", ["studyCreator.hashLengthDesc"], [], ["loc", [null, [45, 7], [45, 42]]]], ["inline", "input", [], ["type", "number", "value", ["subexpr", "@mut", [["get", "model.hashLength", ["loc", [null, [48, 18], [48, 34]]]]], [], []], "insert-newline", "saveSettings", "focus-out", "saveSettings"], ["loc", [null, [47, 4], [50, 38]]]], ["inline", "t", ["studyCreator.repositoryHeader"], [], ["loc", [null, [53, 33], [53, 70]]]], ["inline", "t", ["studyCreator.repositoryUrl"], [], ["loc", [null, [56, 11], [56, 45]]]], ["inline", "t", ["studyCreator.repositoryUrlDesc"], [], ["loc", [null, [57, 7], [57, 45]]]], ["inline", "input", [], ["type", "text", "value", ["subexpr", "@mut", [["get", "model.repositoryURL", ["loc", [null, [61, 20], [61, 39]]]]], [], []], "insert-newline", "fetchBaseFile"], ["loc", [null, [60, 6], [62, 46]]]], ["attribute", "class", ["concat", ["ui icon button ", ["subexpr", "if", [["get", "baseFileIsLoading", ["loc", [null, [64, 41], [64, 58]]]], "loading"], [], ["loc", [null, [64, 36], [64, 70]]]]]]], ["element", "action", ["fetchBaseFile"], [], ["loc", [null, [64, 72], [64, 98]]]], ["block", "if", [["get", "baseFileNotFound", ["loc", [null, [68, 10], [68, 26]]]]], [], 0, null, ["loc", [null, [68, 4], [72, 11]]]], ["inline", "t", ["studyCreator.fingerprint"], [], ["loc", [null, [76, 11], [76, 43]]]], ["inline", "t", ["studyCreator.fingerprintDesc"], [], ["loc", [null, [77, 7], [77, 43]]]], ["inline", "input", [], ["type", "text", "value", ["subexpr", "@mut", [["get", "model.fingerprint", ["loc", [null, [81, 20], [81, 37]]]]], [], []], "insert-newline", "saveSettings", "focus-out", "saveSettings"], ["loc", [null, [80, 6], [83, 40]]]], ["inline", "t", ["studyCreator.enableSecureUpdate"], [], ["loc", [null, [88, 11], [88, 50]]]], ["inline", "t", ["studyCreator.enableSecureUpdateDesc"], [], ["loc", [null, [89, 7], [89, 50]]]], ["inline", "ui-checkbox", [], ["checked", ["subexpr", "@mut", [["get", "model.secureUpdateIsEnabled", ["loc", [null, [91, 26], [91, 53]]]]], [], []], "class", "toggle", "label", ["subexpr", "boolean-to-yesno", [["get", "model.secureUpdateIsEnabled", ["loc", [null, [93, 42], [93, 69]]]]], [], ["loc", [null, [93, 24], [93, 70]]]], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [94, 27], [94, 50]]]]], ["loc", [null, [91, 4], [94, 52]]]], ["inline", "t", ["studyCreator.configurationHeader"], [], ["loc", [null, [97, 33], [97, 73]]]], ["inline", "t", ["studyCreator.networks"], [], ["loc", [null, [100, 11], [100, 40]]]], ["inline", "t", ["studyCreator.networksDesc"], [], ["loc", [null, [101, 7], [101, 40]]]], ["block", "each", [["get", "networks", ["loc", [null, [103, 12], [103, 20]]]]], [], 1, null, ["loc", [null, [103, 4], [188, 13]]]], ["inline", "t", ["studyCreator.autoUpdateHeader"], [], ["loc", [null, [191, 33], [191, 70]]]], ["inline", "t", ["studyCreator.autoUpdate"], [], ["loc", [null, [194, 11], [194, 42]]]], ["inline", "t", ["studyCreator.autoUpdateDesc"], [], ["loc", [null, [195, 7], [195, 42]]]], ["inline", "ui-checkbox", [], ["checked", ["subexpr", "@mut", [["get", "model.autoUpdateIsEnabled", ["loc", [null, [197, 26], [197, 51]]]]], [], []], "class", "toggle", "label", ["subexpr", "boolean-to-yesno", [["get", "model.autoUpdateIsEnabled", ["loc", [null, [199, 42], [199, 67]]]]], [], ["loc", [null, [199, 24], [199, 68]]]], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [200, 27], [200, 50]]]]], ["loc", [null, [197, 4], [200, 52]]]], ["inline", "t", ["studyCreator.forceSecureUpdate"], [], ["loc", [null, [204, 11], [204, 49]]]], ["inline", "t", ["studyCreator.forceSecureUpdateDesc"], [], ["loc", [null, [205, 7], [205, 49]]]], ["inline", "ui-checkbox", [], ["checked", ["subexpr", "@mut", [["get", "model.secureUpdateIsEnabled", ["loc", [null, [207, 26], [207, 53]]]]], [], []], "class", "toggle", "label", ["subexpr", "boolean-to-yesno", [["get", "model.secureUpdateIsEnabled", ["loc", [null, [209, 42], [209, 69]]]]], [], ["loc", [null, [209, 24], [209, 70]]]], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [210, 27], [210, 50]]]]], ["loc", [null, [207, 4], [210, 52]]]], ["inline", "t", ["studyCreator.updateInterval"], [], ["loc", [null, [214, 11], [214, 46]]]], ["inline", "t", ["studyCreator.updateIntervalLabel"], [], ["loc", [null, [215, 7], [215, 47]]]], ["block", "ui-dropdown", [], ["class", "selection", "value", ["subexpr", "@mut", [["get", "settings.system.updateInterval", ["loc", [null, [217, 26], [217, 56]]]]], [], []], "onChange", ["subexpr", "action", ["saveSettings"], [], ["loc", [null, [218, 29], [218, 52]]]]], 2, null, ["loc", [null, [216, 4], [228, 20]]]], ["inline", "t", ["studyCreator.exportConfig"], [], ["loc", [null, [232, 11], [232, 44]]]], ["inline", "t", ["studyCreator.exportConfigDesc"], [], ["loc", [null, [233, 7], [233, 44]]]], ["inline", "input", [], ["value", ["subexpr", "@mut", [["get", "model.fileName", ["loc", [null, [235, 18], [235, 32]]]]], [], []], "insert-newline", "saveSettings", "focus-out", "saveSettings"], ["loc", [null, [235, 4], [237, 38]]]], ["element", "action", ["download"], [], ["loc", [null, [240, 36], [240, 57]]]], ["inline", "t", ["action.download"], [], ["loc", [null, [241, 4], [241, 27]]]]],
      locals: [],
      templates: [child0, child1, child2]
    };
  })());
});
define('rose/transforms/array', ['exports', 'ember', 'ember-data'], function (exports, _ember, _emberData) {
  exports['default'] = _emberData['default'].Transform.extend({
    deserialize: function deserialize(serialized) {
      return _ember['default'].typeOf(serialized) == "array" ? serialized : [];
    },

    serialize: function serialize(deserialized) {
      var type = _ember['default'].typeOf(deserialized);
      if (type == 'array') {
        return deserialized;
      } else if (type == 'string') {
        return deserialized.split(',').map(function (item) {
          return _ember['default'].$.trim(item);
        });
      } else {
        return [];
      }
    }
  });
});
define("rose/transitions/cross-fade", ["exports", "liquid-fire"], function (exports, _liquidFire) {
  exports["default"] = crossFade;

  function crossFade() {
    var opts = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    (0, _liquidFire.stop)(this.oldElement);
    return _liquidFire.Promise.all([(0, _liquidFire.animate)(this.oldElement, { opacity: 0 }, opts), (0, _liquidFire.animate)(this.newElement, { opacity: [opts.maxOpacity || 1, 0] }, opts)]);
  }

  // END-SNIPPET
});
// BEGIN-SNIPPET cross-fade-definition
define("rose/transitions/default", ["exports", "liquid-fire"], function (exports, _liquidFire) {
  exports["default"] = defaultTransition;

  // This is what we run when no animation is asked for. It just sets
  // the newly-added element to visible (because we always start them
  // out invisible so that transitions can control their initial
  // appearance).

  function defaultTransition() {
    if (this.newElement) {
      this.newElement.css({ visibility: '' });
    }
    return _liquidFire.Promise.resolve();
  }
});
define("rose/transitions/explode", ["exports", "ember", "liquid-fire"], function (exports, _ember, _liquidFire) {
  exports["default"] = explode;

  // Explode is not, by itself, an animation. It exists to pull apart
  // other elements so that each of the pieces can be targeted by
  // animations.

  function explode() {
    var _this = this;

    var seenElements = {};
    var sawBackgroundPiece = false;

    for (var _len = arguments.length, pieces = Array(_len), _key = 0; _key < _len; _key++) {
      pieces[_key] = arguments[_key];
    }

    var promises = pieces.map(function (piece) {
      if (piece.matchBy) {
        return matchAndExplode(_this, piece, seenElements);
      } else if (piece.pick || piece.pickOld || piece.pickNew) {
        return explodePiece(_this, piece, seenElements);
      } else {
        sawBackgroundPiece = true;
        return runAnimation(_this, piece);
      }
    });
    if (!sawBackgroundPiece) {
      if (this.newElement) {
        this.newElement.css({ visibility: '' });
      }
      if (this.oldElement) {
        this.oldElement.css({ visibility: 'hidden' });
      }
    }
    return _liquidFire.Promise.all(promises);
  }

  function explodePiece(context, piece, seen) {
    var childContext = _ember["default"].copy(context);
    var selectors = [piece.pickOld || piece.pick, piece.pickNew || piece.pick];
    var cleanupOld, cleanupNew;

    if (selectors[0] || selectors[1]) {
      cleanupOld = _explodePart(context, 'oldElement', childContext, selectors[0], seen);
      cleanupNew = _explodePart(context, 'newElement', childContext, selectors[1], seen);
      if (!cleanupOld && !cleanupNew) {
        return _liquidFire.Promise.resolve();
      }
    }

    return runAnimation(childContext, piece)["finally"](function () {
      if (cleanupOld) {
        cleanupOld();
      }
      if (cleanupNew) {
        cleanupNew();
      }
    });
  }

  function _explodePart(context, field, childContext, selector, seen) {
    var child, childOffset, width, height, newChild;
    var elt = context[field];

    childContext[field] = null;
    if (elt && selector) {
      child = elt.find(selector).filter(function () {
        var guid = _ember["default"].guidFor(this);
        if (!seen[guid]) {
          seen[guid] = true;
          return true;
        }
      });
      if (child.length > 0) {
        childOffset = child.offset();
        width = child.outerWidth();
        height = child.outerHeight();
        newChild = child.clone();

        // Hide the original element
        child.css({ visibility: 'hidden' });

        // If the original element's parent was hidden, hide our clone
        // too.
        if (elt.css('visibility') === 'hidden') {
          newChild.css({ visibility: 'hidden' });
        }
        newChild.appendTo(elt.parent());
        newChild.outerWidth(width);
        newChild.outerHeight(height);
        var newParentOffset = newChild.offsetParent().offset();
        newChild.css({
          position: 'absolute',
          top: childOffset.top - newParentOffset.top,
          left: childOffset.left - newParentOffset.left,
          margin: 0
        });

        // Pass the clone to the next animation
        childContext[field] = newChild;
        return function cleanup() {
          newChild.remove();
          child.css({ visibility: '' });
        };
      }
    }
  }

  function animationFor(context, piece) {
    var name, args, func;
    if (!piece.use) {
      throw new Error("every argument to the 'explode' animation must include a followup animation to 'use'");
    }
    if (_ember["default"].isArray(piece.use)) {
      name = piece.use[0];
      args = piece.use.slice(1);
    } else {
      name = piece.use;
      args = [];
    }
    if (typeof name === 'function') {
      func = name;
    } else {
      func = context.lookup(name);
    }
    return function () {
      return _liquidFire.Promise.resolve(func.apply(this, args));
    };
  }

  function runAnimation(context, piece) {
    return new _liquidFire.Promise(function (resolve, reject) {
      animationFor(context, piece).apply(context).then(resolve, reject);
    });
  }

  function matchAndExplode(context, piece, seen) {
    if (!context.oldElement || !context.newElement) {
      return _liquidFire.Promise.resolve();
    }

    // reduce the matchBy scope
    if (piece.pick) {
      context.oldElement = context.oldElement.find(piece.pick);
      context.newElement = context.newElement.find(piece.pick);
    }

    if (piece.pickOld) {
      context.oldElement = context.oldElement.find(piece.pickOld);
    }

    if (piece.pickNew) {
      context.newElement = context.newElement.find(piece.pickNew);
    }

    // use the fastest selector available
    var selector;

    if (piece.matchBy === 'id') {
      selector = function (attrValue) {
        return "#" + attrValue;
      };
    } else if (piece.matchBy === 'class') {
      selector = function (attrValue) {
        return "." + attrValue;
      };
    } else {
      selector = function (attrValue) {
        var escapedAttrValue = attrValue.replace(/'/g, "\\'");
        return "[" + piece.matchBy + "='" + escapedAttrValue + "']";
      };
    }

    var hits = _ember["default"].A(context.oldElement.find("[" + piece.matchBy + "]").toArray());
    return _liquidFire.Promise.all(hits.map(function (elt) {
      var attrValue = _ember["default"].$(elt).attr(piece.matchBy);

      // if there is no match for a particular item just skip it
      if (attrValue === "" || context.newElement.find(selector(attrValue)).length === 0) {
        return _liquidFire.Promise.resolve();
      }

      return explodePiece(context, {
        pick: selector(attrValue),
        use: piece.use
      }, seen);
    }));
  }
});
define('rose/transitions/fade', ['exports', 'liquid-fire'], function (exports, _liquidFire) {
  exports['default'] = fade;

  function fade() {
    var _this = this;

    var opts = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var firstStep;
    var outOpts = opts;
    var fadingElement = findFadingElement(this);

    if (fadingElement) {
      // We still have some older version that is in the process of
      // fading out, so out first step is waiting for it to finish.
      firstStep = (0, _liquidFire.finish)(fadingElement, 'fade-out');
    } else {
      if ((0, _liquidFire.isAnimating)(this.oldElement, 'fade-in')) {
        // if the previous view is partially faded in, scale its
        // fade-out duration appropriately.
        outOpts = { duration: (0, _liquidFire.timeSpent)(this.oldElement, 'fade-in') };
      }
      (0, _liquidFire.stop)(this.oldElement);
      firstStep = (0, _liquidFire.animate)(this.oldElement, { opacity: 0 }, outOpts, 'fade-out');
    }
    return firstStep.then(function () {
      return (0, _liquidFire.animate)(_this.newElement, { opacity: [opts.maxOpacity || 1, 0] }, opts, 'fade-in');
    });
  }

  function findFadingElement(context) {
    for (var i = 0; i < context.older.length; i++) {
      var entry = context.older[i];
      if ((0, _liquidFire.isAnimating)(entry.element, 'fade-out')) {
        return entry.element;
      }
    }
    if ((0, _liquidFire.isAnimating)(context.oldElement, 'fade-out')) {
      return context.oldElement;
    }
  }
  // END-SNIPPET
});
// BEGIN-SNIPPET fade-definition
define('rose/transitions/flex-grow', ['exports', 'liquid-fire'], function (exports, _liquidFire) {
  exports['default'] = flexGrow;

  function flexGrow(opts) {
    (0, _liquidFire.stop)(this.oldElement);
    return _liquidFire.Promise.all([(0, _liquidFire.animate)(this.oldElement, { 'flex-grow': 0 }, opts), (0, _liquidFire.animate)(this.newElement, { 'flex-grow': [1, 0] }, opts)]);
  }
});
define('rose/transitions/fly-to', ['exports', 'liquid-fire'], function (exports, _liquidFire) {
  exports['default'] = flyTo;

  function flyTo() {
    var _this = this;

    var opts = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    if (!this.newElement) {
      return _liquidFire.Promise.resolve();
    } else if (!this.oldElement) {
      this.newElement.css({ visibility: '' });
      return _liquidFire.Promise.resolve();
    }

    var oldOffset = this.oldElement.offset();
    var newOffset = this.newElement.offset();

    if (opts.movingSide === 'new') {
      var motion = {
        translateX: [0, oldOffset.left - newOffset.left],
        translateY: [0, oldOffset.top - newOffset.top],
        outerWidth: [this.newElement.outerWidth(), this.oldElement.outerWidth()],
        outerHeight: [this.newElement.outerHeight(), this.oldElement.outerHeight()]
      };
      this.oldElement.css({ visibility: 'hidden' });
      return (0, _liquidFire.animate)(this.newElement, motion, opts);
    } else {
      var motion = {
        translateX: newOffset.left - oldOffset.left,
        translateY: newOffset.top - oldOffset.top,
        outerWidth: this.newElement.outerWidth(),
        outerHeight: this.newElement.outerHeight()
      };
      this.newElement.css({ visibility: 'hidden' });
      return (0, _liquidFire.animate)(this.oldElement, motion, opts).then(function () {
        _this.newElement.css({ visibility: '' });
      });
    }
  }
});
define('rose/transitions/move-over', ['exports', 'liquid-fire'], function (exports, _liquidFire) {
  exports['default'] = moveOver;

  function moveOver(dimension, direction, opts) {
    var _this = this;

    var oldParams = {},
        newParams = {},
        firstStep,
        property,
        measure;

    if (dimension.toLowerCase() === 'x') {
      property = 'translateX';
      measure = 'width';
    } else {
      property = 'translateY';
      measure = 'height';
    }

    if ((0, _liquidFire.isAnimating)(this.oldElement, 'moving-in')) {
      firstStep = (0, _liquidFire.finish)(this.oldElement, 'moving-in');
    } else {
      (0, _liquidFire.stop)(this.oldElement);
      firstStep = _liquidFire.Promise.resolve();
    }

    return firstStep.then(function () {
      var bigger = biggestSize(_this, measure);
      oldParams[property] = bigger * direction + 'px';
      newParams[property] = ["0px", -1 * bigger * direction + 'px'];

      return _liquidFire.Promise.all([(0, _liquidFire.animate)(_this.oldElement, oldParams, opts), (0, _liquidFire.animate)(_this.newElement, newParams, opts, 'moving-in')]);
    });
  }

  function biggestSize(context, dimension) {
    var sizes = [];
    if (context.newElement) {
      sizes.push(parseInt(context.newElement.css(dimension), 10));
      sizes.push(parseInt(context.newElement.parent().css(dimension), 10));
    }
    if (context.oldElement) {
      sizes.push(parseInt(context.oldElement.css(dimension), 10));
      sizes.push(parseInt(context.oldElement.parent().css(dimension), 10));
    }
    return Math.max.apply(null, sizes);
  }
});
define("rose/transitions/scale", ["exports", "liquid-fire"], function (exports, _liquidFire) {
  exports["default"] = scale;

  function scale() {
    var _this = this;

    var opts = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    return (0, _liquidFire.animate)(this.oldElement, { scale: [0.2, 1] }, opts).then(function () {
      return (0, _liquidFire.animate)(_this.newElement, { scale: [1, 0.2] }, opts);
    });
  }
});
define('rose/transitions/scroll-then', ['exports', 'ember'], function (exports, _ember) {
  exports['default'] = function (nextTransitionName, options) {
    for (var _len = arguments.length, rest = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      rest[_key - 2] = arguments[_key];
    }

    var _this = this;

    _ember['default'].assert("You must provide a transition name as the first argument to scrollThen. Example: this.use('scrollThen', 'toLeft')", 'string' === typeof nextTransitionName);

    var el = document.getElementsByTagName('html');
    var nextTransition = this.lookup(nextTransitionName);
    if (!options) {
      options = {};
    }

    _ember['default'].assert("The second argument to scrollThen is passed to Velocity's scroll function and must be an object", 'object' === typeof options);

    // set scroll options via: this.use('scrollThen', 'ToLeft', {easing: 'spring'})
    options = _ember['default'].merge({ duration: 500, offset: 0 }, options);

    // additional args can be passed through after the scroll options object
    // like so: this.use('scrollThen', 'moveOver', {duration: 100}, 'x', -1);

    return window.$.Velocity(el, 'scroll', options).then(function () {
      nextTransition.apply(_this, rest);
    });
  };
});
define("rose/transitions/to-down", ["exports", "rose/transitions/move-over"], function (exports, _roseTransitionsMoveOver) {
  exports["default"] = function (opts) {
    return _roseTransitionsMoveOver["default"].call(this, 'y', 1, opts);
  };
});
define("rose/transitions/to-left", ["exports", "rose/transitions/move-over"], function (exports, _roseTransitionsMoveOver) {
  exports["default"] = function (opts) {
    return _roseTransitionsMoveOver["default"].call(this, 'x', -1, opts);
  };
});
define("rose/transitions/to-right", ["exports", "rose/transitions/move-over"], function (exports, _roseTransitionsMoveOver) {
  exports["default"] = function (opts) {
    return _roseTransitionsMoveOver["default"].call(this, 'x', 1, opts);
  };
});
define("rose/transitions/to-up", ["exports", "rose/transitions/move-over"], function (exports, _roseTransitionsMoveOver) {
  exports["default"] = function (opts) {
    return _roseTransitionsMoveOver["default"].call(this, 'y', -1, opts);
  };
});
define("rose/utils/i18n/compile-template", ["exports", "ember-i18n/compile-template"], function (exports, _emberI18nCompileTemplate) {
  exports["default"] = _emberI18nCompileTemplate["default"];
});
define("rose/utils/i18n/missing-message", ["exports", "ember-i18n/missing-message"], function (exports, _emberI18nMissingMessage) {
  exports["default"] = _emberI18nMissingMessage["default"];
});
/* jshint ignore:start */

/* jshint ignore:end */

/* jshint ignore:start */

define('rose/config/environment', ['ember'], function(Ember) {
  var prefix = 'rose';
/* jshint ignore:start */

try {
  var metaName = prefix + '/config/environment';
  var rawConfig = Ember['default'].$('meta[name="' + metaName + '"]').attr('content');
  var config = JSON.parse(unescape(rawConfig));

  return { 'default': config };
}
catch(err) {
  throw new Error('Could not read config from meta tag with name "' + metaName + '".');
}

/* jshint ignore:end */

});

if (!runningTests) {
  require("rose/app")["default"].create({"name":"rose","version":"3.0.3yiran"});
}

/* jshint ignore:end */
//# sourceMappingURL=rose.map