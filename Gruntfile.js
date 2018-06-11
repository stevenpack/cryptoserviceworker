const x = require('dotenv').config();
const request = require('request');
const fs = require('fs');
const log = console; //todo: grunt.log doesn't exist?
const TASK_FAILED = 3;

module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-replace');
  grunt.initConfig({
    replace: {
      comments: {
        options: {
          patterns: [
            {
              /* Comment imports for node during dev */
              match: /--BEGIN COMMENT--[\s\S]*?--END COMMENT--/g,
              replacement: 'Dev environment code block removed by build'
            },
            {
              /* Uncomment preamble for production to process the request */
              match: /\/\/\//mg,
              replacement: ''
            }
          ]
        },
        files: [
          {expand: true, flatten: true, src: ['src/service-worker.ts'], dest: 'build/'}
        ]
      },
      exports: {
        //remove the exports line that typescript includes without an option to
        //suppress, but is not in the v8 env that workers run in.
        options: {
          patterns: [
            {
              match: /exports.__esModule = true;/g,
              replacement: "// exports line commented by build"
            }
          ]
        },
        files: [
          {expand: true, flatten: true, src: ['build/service-worker.js'], dest: 'build/'}
        ]
      }
    }
  });

  /*

  Get Assigned Routes (yes)

curl -X GET "https://api.cloudflare.com/client/v4/zones/8ce50d164136fbcb20cc3f2b70225c1e/workers/filters" -H "X-Auth-Email:spack@cloudflare.com" -H "X-Auth-Key:83ab8bff325af98b41ccf9ab39dce078295de"

Download Worker (yes)

curl -X GET "https://api.cloudflare.com/client/v4/zones/8ce50d164136fbcb20cc3f2b70225c1e/workers/script" -H "X-Auth-Email:spack@cloudflare.com" -H "X-Auth-Key:83ab8bff325af98b41ccf9ab39dce078295de"

Upload Worker (yes)

curl -X PUT "https://api.cloudflare.com/client/v4/zones/8ce50d164136fbcb20cc3f2b70225c1e/workers/script" -H
"X-Auth-Email:spack@cloudflare.com" -H "X-Auth-Key:83ab8bff325af98b41ccf9ab39dce078295de" -H
"Content-Type:application/javascript" --data-binary "build/service-worker.js"
   */

  function logResult(body) {
    body.success ? log.error("Status: Success") : log.error("Status: Failed");
    let errors = body.errors || [];
    if (errors) {
      log.info(`Errors: ${errors.length}`);
      for (let e of errors) {
        log.error(`Code: ${e.code} Message: ${e.message}`);
      }
    }
    let messages = body.messages || [];
    if (messages) {
      log.info(`Messages ${messages.length}`);
      for (let msg of messages) {
        log.info(`${msg}`);
      }
    }
    let result = body.result;
    log.info("Result");
    log.info(result);
  }

  function requestAndProcess(options, conf, done) {

    // Add authentication to the request
    options.headers = options.headers || {};
    Object.assign(options.headers, {
      'X-Auth-Email': conf.email,
      'X-Auth-Key': conf.authKey,
    });

    request(options, function(error, response) {
      try {
        if (error) {
          log.error(error);
          fail(`API failure ${response.statusCode} error: ${error}`);
          done();
          return;
        }
        let body = JSON.parse(response.body);
        if (body) {
          logResult(body);
        }
        done();
      } catch (e) {
        fail(`Unhandled error. ${e}`);
        done();
      }
    });
  }

  function readConfig() {
    let zoneId = grunt.option('zoneId') || process.env.CF_WORKER_ZONE_ID;
    let email = grunt.option('email') || process.env.CF_WORKER_EMAIL;
    let authKey = grunt.option('authKey') || process.env.CF_WORKER_AUTH_KEY;

    log.debug("zoneID: " + zoneId);
    log.debug("email: " + email);
    log.debug("authKey: " + "*".repeat(authKey.length));

    if (!zoneId || !email || !authKey) {
      fail("Zone, email and authKey are required");
    }
    return {
      zoneId: zoneId,
      email: email,
      authKey: authKey
    }
  }

  function fail(message) {
    grunt.fail.fatal(message, TASK_FAILED);
  }

  grunt.registerTask('cf-worker-upload', 'Uploads workers to Cloudflare', async function(path) {

    const done = this.async();

    const conf = readConfig();
    path = path || grunt.option('path') || process.env.CF_WORKER_PATH;
    if (!path) {
      fail("path is required");
    }
    if (!fs.existsSync(path)) {
      fail(`path not found ${path}`);
    }
    let script = fs.readFileSync(path);

    log.info("Uploading...");
    let url = `https://api.cloudflare.com/client/v4/zones/${conf.zoneId}/workers/script`;
    let options = {
      url: url,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/javascript'
      },
      body: script
    };
    requestAndProcess(options, conf, done);
  });
  grunt.registerTask('cf-worker-list', "List Cloudflare workers", async function() {
    const done = this.async();
    const conf = readConfig();
    log.info("Listing...");
    let url = `https://api.cloudflare.com/client/v4/zones/${conf.zoneId}/workers/filters`;
    let options = {
      url: url,
      method: 'GET'
    };
    requestAndProcess(options, conf, done);
  });
  grunt.registerTask('fix-comments', 'replace:comments');
  grunt.registerTask('fix-export', 'replace:exports');

};
