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

var compiler = require('nscale-compiler')();
var _ = require('lodash');
var async = require('async');
var ngit = require('nodegit');
var ku = require('./kutils');

// TODO unit test for this...

module.exports = function(synchrotron, loadConfig, logger, kernelConfig) {

  var swapId = function(system, cdef, newId, out, apply) {
    var oldId = cdef.id;

    cdef.id = newId;

    // set the commit in all instances of that container definition
    _.chain(system.topology.containers)
     .values()
     .filter(function(c) { return c.containerDefinitionId === oldId; })
     .forEach(function(c) {
       var oldId = c.id;
       c.containerDefinitionId = cdef.id;
       c.specific = c.specific || {};
       apply(c);

       if (c.id !== oldId) {
         delete system.topology.containers[oldId];
         system.topology.containers[c.id] = c;

         var parent = system.topology.containers[c.containedBy];

         parent.contains = parent.contains.filter(function(id) {
           return id !== oldId;
         });

         parent.contains.push(c.id);
       }
     });

    out.stdout('--> Renamed definition ' + oldId + ' into ' + cdef.id, 'info');
  };



  var setCommitSha = function(system, cdef, out, cb) {
    synchrotron.synch(system, cdef, out, function(err) {
      if (err) { return cb(err); }
      var uh = ku.parseGitUrl(cdef.specific.repositoryUrl);
      var path = system.repoPath + '/workspace/' + (cdef.specific.checkoutDir || uh.repo);
      ngit.Repository.open(path, function(err, repo) {
        if (err) { return cb(err); }
        ngit.Reference.nameToId(repo, 'HEAD', function(err, head) {
          if (err) { return cb(err); }

          var commit = head.toString();
          var newId = cdef.id + '$' + commit;
          cdef.specific.commit = commit;

          swapId(system, cdef, newId, out, function(container) {
            container.id += '$' + commit;
            container.specific.commit = commit;
          });

          cb();
        });
      });
    });
  };



  var setDockerTag = function(system, cdef, out, cb) {
    var tag = cdef.specific.name;

    if (tag.indexOf(':') < 0) {
      tag += ':latest';
    }

    cdef.specific.name = tag;

    var taggish = cdef.specific.name.replace(':', '_').replace('-', '.').replace('/', '.');
    var newId = cdef.id + '$' + taggish;

    swapId(system, cdef, newId, out, function(container) {
      container.specific.name = tag;
      container.id += '$' + taggish;
    });

    cb();
  };



  var loadConfiguration = function(systemId, path, cb) {
    // fake a system
    loadConfig({
      id: systemId,
      repoPath: path,
      topology: {
      }
    }, function(err, config) {
      cb(err, config);
    });
  };



  var compile = function compile(systemId, path, out, cb) {
    loadConfiguration(systemId, path, function(err, config) {
      if (err) { return cb(err); }

      // pass the autoCheckoutDir global config through
      if (config.autoCheckoutDir === undefined) {
        config.autoCheckoutDir = kernelConfig.autoCheckoutDir || kernelConfig.kernel.autoCheckoutDir;
      }

      compiler.compileAll(path, config, function(err, systems) {
        if (err) {
          logger.error(err);

          // FIXME the error here is swallowed
          // so that the client completes correctly
          // and does display nice stuff
          return cb(new Error(_.reduce(err.reasons, function(acc, reason) {
            return acc + '\n' + '--> ' + reason;
          }, err.message)));
        }

        async.eachSeries(_.keys(systems), function(key, next) {
          var system = systems[key];
          system.repoPath = path;
          async.eachSeries(system.containerDefinitions, function(cdef, cb) {
            if (!cdef.specific || !(cdef.specific.repositoryUrl || cdef.specific.name)) {
              return cb();
            }

            var func;

            if (cdef.specific.repositoryUrl) {
              func = setCommitSha;
            }
            else {
              func = setDockerTag;
            }

            func(system, cdef, out, function(err) {
              cb(err);
            });
          }, function(err) {
            delete system.repoPath;
            next(err, system);
          });
        }, function(err) {
          cb(err, systems);
        });
      });
    });
  };



  var listTargets = function listTargets(path, cb) {
    compiler.listTargets(path, cb);
  };



  return {
    compile: compile,
    listTargets: listTargets
  };
};


module.exports(null);

