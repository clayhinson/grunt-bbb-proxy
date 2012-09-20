/**
 * Task: mote
 * Description: Compile mote templates to JST file
 * Dependencies: mote
 * Contributor: @tbranyen
 */

module.exports = function(grunt) {
  "use strict";

  // TODO: ditch this when grunt v0.4 is released
  grunt.util = grunt.util || grunt.utils;

  var _ = grunt.util._;

  grunt.registerMultiTask("mote", "Register mote partials and then Compile mote templates to JST file", function() {
    var options = grunt.helper("options", this, {namespace: "JST"});

    grunt.verbose.writeflags(options, "Options");

    // TODO: ditch this when grunt v0.4 is released
    this.files = this.files || grunt.helper("normalizeMultiTaskFiles", this.data, this.target);
    var srcFiles;
    var partialFiles;
    var taskOutput = [];
    var sourceCode;
    var sourceCompiled;
    var expandedFiles;

    var helperNamespace = "this['" + options.namespace + "']";
    var isPartial = options.partialRegex || /^_/;

    var defaultProcessPartialName = function(filePath) {
      var pieces = _.last(filePath.split("/")).split(".");
      var name   = _(pieces).without(_.last(pieces)).join("."); // strips file extension
      return name.substr(1, name.length);                       // strips leading _ character
    };

    var preProcessWithHelper = function(files, helper, output) {
      files.forEach(function(srcFile) {
        sourceCode = grunt.file.read(srcFile);

        // non-partials
        if (helper === "mote" && options.processName && _.isFunction(options.processName)) {
          srcFile = options.processName(srcFile);
        }

        // partials
        if (helper === "mote-partial" && options.processPartialName && _.isFunction(options.processPartialName)) {
          srcFile = options.processPartialName(srcFile);
        } else if (helper === "mote-partial") {
          srcFile = defaultProcessPartialName(srcFile);
        }

        sourceCompiled = grunt.helper(helper, sourceCode, srcFile, helperNamespace);
        output.push(sourceCompiled);
      });
    };

    this.files.forEach(function(file) {
      expandedFiles = grunt.file.expandFiles(file.src);

      srcFiles = _.filter(expandedFiles, function(f) {
        return !isPartial.test(_.last(f.split("/")));
      });

      partialFiles = _.filter(expandedFiles, function(f) {
        return isPartial.test(_.last(f.split("/")));
      });

      taskOutput.push(helperNamespace + " = " + helperNamespace + " || {};");

      preProcessWithHelper(partialFiles, "mote-partial",    taskOutput);
      preProcessWithHelper(srcFiles,     "mote", taskOutput);

      if (taskOutput.length > 0) {
        grunt.file.write(file.dest, taskOutput.join("\n\n"));
        grunt.log.writeln("File '" + file.dest + "' created.");
      }
    });
  });

  grunt.registerHelper("mote", function(source, filepath, namespace) {
    try {
    var templateString = grunt.file.read(filepath)
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t'),
      	output = 'mote.compile("' + templateString + '");';
      return namespace + "['" + filepath + "'] = " + output;
    } catch (e) {
      grunt.log.error(e);
      grunt.fail.warn("mote failed to compile.");
    }
  });
};