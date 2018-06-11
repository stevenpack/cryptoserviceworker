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

  let requestAndProcess = (options, done) => {
    request(options, function(error, response) {
      try {
        if (error) {
          log.error(error);
          grunt.fail.fatal(`Upload failed statusCode: ${response.statusCode} error: ${error}`, TASK_FAILED);
          done();
          return;
        }
        let body = JSON.parse(response.body);
        if (body) {
          if (!body.success) {
            log.error("Upload failed");
            let errors = body.errors;
            if (errors) {
              for (let e of errors) {
                log.error(`Code: ${e.code} Message: ${e.message}`);
              }
            }
            done();
            return;
          }
          log.info("Upload succeeded");
          let messages = body.messages;
          for (let m of messages) {
            log.info(`${m}`);
          }
        }
        done();
      } catch (e) {
        grunt.fail.fatal("Unhandled error. " + e, TASK_FAILED);
        done();
      }


    });
  };


  grunt.registerTask('upload-worker', 'Uploads workers to Cloudflare', async function(zoneId, email, authKey, path) {

    const done = this.async();

    zoneId = zoneId || grunt.option('zoneId') || process.env.CF_WORKER_ZONE_ID;
    email = email || grunt.option('email') || process.env.CF_WORKER_EMAIL;
    authKey = authKey || grunt.option('authKey') || process.env.CF_WORKER_AUTH_KEY;
    path = path || grunt.option('path') || process.env.CF_WORKER_PATH;

    log.debug("zoneID: " + zoneId);
    log.debug("email: " + email);
    log.debug("authKey: " + "*".repeat(authKey.length));
    log.debug("path: " + path);

    if (!zoneId || !email || !authKey || !path) {
      grunt.fail.fatal("Zone, email, auth key and path all required", TASK_FAILED);
    }
    log.info("Uploading...");
    let url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/script`;
    let script = fs.readFileSync(path);
    let options = {
      url: url,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/javascript',
        'X-Auth-Email': email,
        'X-Auth-Key': authKey,
      },
      body: script
    };
    requestAndProcess(options, done);
  });
  grunt.registerTask('list-workers', "List Cloudflare workers", async function(zoneId, email, authKey) {


  });
  grunt.registerTask('fix-comments', 'replace:comments');
  grunt.registerTask('fix-export', 'replace:exports');

};
