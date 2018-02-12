/*
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

var assert = require('assert');
var getTmpDir = require('../helpers/get-tmp-dir');
var prepareConfig = require('../helpers/prepare-config');
var loader = require('../../lib/configLoader');
var fs = require('fs');
var path = require('path');

describe('config loader', function() {
  var dir;
  var sourceConfig;
  var system;

  beforeEach(function() {
    sourceConfig = prepareConfig(require('../data/basic-config'));
    dir = getTmpDir();
    system = JSON.parse(fs.readFileSync(path.join(__dirname, 'system.json')));
    fs.writeFileSync(path.join(dir, 'development.json'), JSON.stringify(system));
    system.repoPath = dir;
  });

  it('should load the system config if no config is in the system root', function(done) {
    var load = loader(sourceConfig);
    system.topology.name = 'development';
    load(system, function(err, config) {
      assert.deepEqual(config, sourceConfig);
      assert.notEqual(config, sourceConfig);
      done();
    });
  });

  it('should load the config with some additional local config as JS', function(done) {
    var load = loader(sourceConfig);
    var localConfig = {
      hello: 'world'
    };
    system.topology.name = 'development';
    var configString = 'module.exports = ' + JSON.stringify(localConfig, null, 2);
    fs.writeFileSync(path.join(dir, 'config.js'), configString);
    load(system, function(err, config) {
      assert.equal(config.hello, localConfig.hello);
      delete config.hello;
      assert.deepEqual(config, sourceConfig);
      assert.notEqual(config, sourceConfig);
      done();
    });
  });

  it('should load the target-specific config as JS', function(done) {
    var load = loader(sourceConfig);
    var localConfig = {
      development: {
        hello: 'world'
      }
    };
    var configString = 'module.exports = ' + JSON.stringify(localConfig, null, 2);
    fs.writeFileSync(path.join(dir, 'config.js'), configString);
    system.topology.name = 'development';
    load(system, function(err, config) {
      assert.equal(config.hello, localConfig.development.hello);
      delete config.hello;
      delete config.development;
      assert.deepEqual(config, sourceConfig);
      assert.notEqual(config, sourceConfig);
      done();
    });
  });

  it('should skip irrelevant target-specific config', function(done) {
    var load = loader(sourceConfig);
    var localConfig = {
      development: {
        hello: 'world'
      }
    };
    var configString = 'module.exports = ' + JSON.stringify(localConfig, null, 2);
    fs.writeFileSync(path.join(dir, 'config.js'), configString);
    system.topology.name = 'staging';
    load(system, function(err, config) {
      assert(!config.hello);
      delete config.development;
      assert.deepEqual(config, sourceConfig);
      assert.notEqual(config, sourceConfig);
      done();
    });
  });

  it('should error if the config file is an unknonwn identifier', function(done) {
    var load = loader(sourceConfig);
    fs.writeFileSync(path.join(dir, 'config.js'), 'ahahah');
    load(system, function(err) {
      assert(err, 'missing err');
      done();
    });
  });

  it('should error if the config file has a syntax error', function(done) {
    var load = loader(sourceConfig);
    fs.writeFileSync(path.join(dir, 'config.js'), 'module.exports = { aaa: "bbb" ccc: "ddd" }');
    load(system, function(err) {
      assert(err, 'missing err');
      done();
    });
  });
});
