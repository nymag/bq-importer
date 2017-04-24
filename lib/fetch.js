'use strict';

const bluebird = require('bluebird'),
  _ = require('lodash'),
  // todo: is it worth requiring amphora for this?
  log = require('amphora').log.withStandardPrefix(__filename),
  throttle = require('./throttle'), // wrapped so that it can be stubbed
  protocol = 'http://',
  publishedVersion = '@published',
  jsonExtension = '.json';

/**
 * log error, do not throw
 * @param {object} data
 * @returns {Function}
 */
function logSwallowedError(data) {
  return function (err) {
    log('error', err);
    return data;
  };
}

/**
 * ensure we have protocol and @published.json
 * @param {string} str
 * @returns {string}
 */
function ensurePublishedJsonUrl(str) {
  return (str.substr(0, 7).toLowerCase() === protocol ? '' : protocol) +
    str +
    (str.substr(-10) === publishedVersion ? '' : publishedVersion) +
    jsonExtension;
}

/**
 * I think we want to keep the `@published` in the uri
 * @param {string} url
 * @returns {string}
 */
function urlToUri(url) {
  return url.substr(protocol.length).split(jsonExtension)[0];
}

/**
 * for some reason the header status is 200 and the 404 message is in the json
 * @param {object} [json]
 * @returns {*}
 */
function throwOn404Json(json) {
  const code = _.get(json, 'code');

  if (code && code > 200) {
    throw new Error(code.toString());
  } else {
    return json;
  }
}

/**
 * fetch json for a single composed instance
 * @param {string} url e.g. `http://types.nymag.sites.aws.nymetro.com/selectall/pages/an-instance`
 * @param {Function} transform js module that takes json and transforms it to bq fields
 * @returns {Promise} resolves to an object
 */
function fetchInstance(url, transform) {
  // Throttle requests - 1000/60s
  let lp = new throttle.requestPromise(1,1),
    publishedUrl = ensurePublishedJsonUrl(url),
    publishedUri = urlToUri(publishedUrl);

  return bluebird.resolve(
    lp.req(
      {
        url: publishedUrl,
        simple: false
      })
    )
    .then(json => JSON.parse(json))
    .then(throwOn404Json)
    .then(transform.bind(null, publishedUri))
    .catch(logSwallowedError(null));
}

/**
 * fetch composed json for all instances in a list endpoint
 * @param {string} url  e.g. `http://types.nymag.sites.aws.nymetro.com/selectall/pages`
 * @param {Function} transform js module that takes json and transforms it to bq fields
 * @returns {Promise} resolves to an array of objects
 */
function fetchListInstances(url, transform) {
  // Throttle requests - 1000/60s
  let lp = new throttle.requestPromise(1,1);

  return bluebird.resolve(
      lp.req({
        url: url,
        simple: false
      })
    )
    .then(json => JSON.parse(json))
    // .tap(list => console.log('list of uris to get', list))
    .then(list => bluebird.all(
      list.map(url => module.exports.fetchInstance(url, transform))
    ))
    .then(_.compact);
    // .tap(list => console.log('compacted results to return', list))
}

module.exports.fetchInstance = fetchInstance;
module.exports.fetchListInstances = fetchListInstances;