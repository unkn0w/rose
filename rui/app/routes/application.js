import Ember from 'ember';

const { Promise } = Ember.RSVP;

export default Ember.Route.extend({
  beforeModel() {
    let settings = this.get('settings');
    return Promise.all([settings.setup()]);
  },

  afterModel() {
    this.set('i18n.locale', this.get('settings.user.currentLanguage'));
  },

  setupController(controller, model) {
    this._super(controller, model)

    return this.store.find('network').then((networks) => {
      controller.set('networks', networks);
    })
  },

  actions: {
    resetConfig() {
      let settings = this.get('settings.user');
      settings.destroyRecord()
        .then(() => this.get('settings').setup())
        .then(() => this.transitionTo('application'));
    },

    loading() {
      this.controller.set('isLoading', true)
      this.router.one('didTransition', () => {
        this.controller.set('isLoading', false)
      })
      return true
    }
  }
});
