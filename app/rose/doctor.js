import _startsWith from 'lodash/startsWith'
import localforage from 'localforage'

function repairMissingInteractions () {
    localforage.keys()
        .then((keys) => keys.filter((key) => _startsWith(key, 'Interaction/')))
        .then((interactionKeys) => localforage.setItem('Interactions', interactionKeys))
        .catch((err) => console.log(err))
}

export default { repairMissingInteractions }
