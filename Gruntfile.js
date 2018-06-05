module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-replace');
  grunt.initConfig({
    replace: {
      dist: {
        options: {
          patterns: [
            {
              match: /--BEGIN COMMENT--[\s\S]*?--END COMMENT--/g,
              replacement: 'Code Snippet Removed by Build'
            }
          ]
        },
        files: [
          {expand: true, flatten: true, src: ['src/service-worker.ts'], dest: 'build/'}
        ]
      }
    }
  });
  grunt.registerTask('publish', 'replace');
};
