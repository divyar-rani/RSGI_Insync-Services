const jdiff = require('json-diff');

class compare {

    json(j1, j2) {
        // return jdiff.diffString(j1, j2);
        return jdiff.diff(j1, j2);
    }
}

module.exports = compare;