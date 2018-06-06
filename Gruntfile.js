module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-replace');
  grunt.initConfig({
    replace: {
      comments: {
        options: {
          patterns: [
            {
              /* Comment out dev code */
              match: /--BEGIN COMMENT--[\s\S]*?--END COMMENT--/g,
              replacement: 'Dev environment code block removed by build'
            },
            {
              /* Uncomment preamble for production*/
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
  grunt.registerTask('fix-comments', 'replace:comments');
  grunt.registerTask('fix-export', 'replace:exports');
};
