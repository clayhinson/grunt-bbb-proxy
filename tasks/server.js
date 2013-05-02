/*global process,require,module */
/*
 * Grunt Task File
 * ---------------
 *
 * Task: Server
 * Description: Serve the web application.
 * Dependencies: express
 *
 */

module.exports = function(grunt) {

  // Determine the client based on the hostname
  var client;
  function determineClient(host, hostMapping) {
    return client || (function() {
      // Use a default if we're on opal
      if (!host || /opal/.test(host)) {
        return "opal";
      }
      // Use a default if the hostMapping is empty
      else {
        return hostMapping[host] || "toshiba";
      }
    }());
  }

  // TODO: ditch this when grunt v0.4 is released
  grunt.util = grunt.util || grunt.utils;

  var _ = grunt.util._;
  // Shorthand Grunt functions
  var log = grunt.log;

  grunt.registerTask("server", "Run development server.", function(prop) {
    var options;
    var props = ["server"];

    // Keep alive
    var done = this.async();

    // If a prop was passed as the argument, use that sub-property of server.
    if (prop) { props.push(prop); }

    // Defaults set for server values
    options = _.defaults(grunt.config(props) || {}, {
      favicon: "./favicon.ico",
      index: "./index.html",

      port: process.env.PORT || 80,
      host: process.env.HOST || process.env.HOSTNAME || "127.0.0.1"
    });

    // Ensure folders have correct defaults
    options.folders = options.folders || {};
    options.folders = _.defaults(options.folders, {
      app: "./app",
      assets: "./assets",
      dist: "./dist",
      config: "./config"
    });

    options.files = options.files || {};

    // Ensure files have correct defaults
    options.files = _.defaults(options.files, {
      "app/config.js": "app/config.js"
    });

    // Run the server
    grunt.helper("server", options);

    // Fail task if errors were logged
    if (grunt.errors) { return false; }

    log.writeln("Listening on http://" + options.host + ":" + options.port);
  });

  grunt.registerHelper("server", function(options) {
    // Require libraries.
    var fs = require("fs");
    var path = require("path");
    var stylus = require("stylus");
    var express = require("express");

    // Strip out /{appname}/{appversion}
    var stripRouteBase = function(req, res, next) {
      req.url = req.url.replace(/^\/\w+\/\d+\/?(.*)$/, "/$1");
      next();
    };

    // Set a client override
    var setClientOverride = function(req, res, next) {
      client = client || req.query && req.query.client;
      next();
    };

    // CORS Middleware
    var allowCrossDomain = function(req, res, next) {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

      // intercept OPTIONS method
      if ('OPTIONS' == req.method) {
        res.send(200);
      }
      else {
        next();
      }
    };

    // HOST mapping for clients
    var hostMapping = {
      "toshiba.mobile.syn-pub.com": "toshiba",
      "centurylink.mobile.syn-pub.com": "centurylink"
    };

    // If the server is already available use it.
    var site = options.server ? options.server() : express.createServer();
    site.use(allowCrossDomain);
    site.use(setClientOverride);
    site.use(stripRouteBase);

    // Allow users to override the root.
    var root = _.isString(options.root) ? options.root : "/";

    // Process stylus stylesheets.
    site.get(/.styl$/, function(req, res) {
      var url = req.url.split("assets/css/")[1];
      var file = path.join("assets/css", url);

      fs.readFile(file, function(err, contents) {
        var processer = stylus(contents.toString());

        processer.set("paths", ["assets/css/"]);
        processer.render(function(err, css) {
          res.header("Content-type", "text/css");
          res.send(css);
        });
      });
    });

    // Determine favicon path
    site.get("/favicon.ico", function(req, res, next) {
      var client = determineClient(req.headers.host, hostMapping);

      // Use a default if we're on opal
      client = (client === "opal") && "toshiba" || client;
      return res.redirect("./assets/img/" + client + "/favicon.ico", 302);
    });

    // Process config url
    site.get("/config.json", function(req, res, next) {
      var client = determineClient(req.headers.host, hostMapping);

      // Use a default if we're on opal
      client = (client === "opal") && "toshiba" || client;
      return res.redirect("/config/" + client + "/config.json", 302);
    });

    // Process proxy urls
    var makeRequest = function(url, res, next) {
      // Make the request
      require("http").get(require("url").parse(url), function(http_res) {
        var body = "";
        http_res.setEncoding('utf8');
        http_res.on('data', function(chunk) {
          body += chunk;
        });
        http_res.on('end', function() {
          var vamResponse;
          body = body.replace(/^[^\{]+/, '');
          if (body) {
            vamResponse = JSON.parse(body);
          }
          res.json(vamResponse || {}, 200);
        });
        http_res.on('close', function(err) {
          res.send(err, 500);
        });
      });
    };
	// VAM
    site.get("/vam/*", function(req, res, next) {
      var client = determineClient(req.headers.host, hostMapping);
      client = (client === "opal") && "toshiba" || client;
      makeRequest("http://" + client + ".am4.syn-api.com/" + req.params[0], res, next);
    });
    // Recommendations
    site.get("/recommendations/*", function(req, res, next) {
      var client = determineClient(req.headers.host, hostMapping);
      client = (client === "opal") && "toshiba" || client;
      makeRequest("http://" + client + ".recommendation1.svcs.opal.synacor.com:4080/v1/" + req.params[0], res, next);
    });

    // Handle config responses with caching, etc.
    site.get("/config/:client/*", function(req, res, next) {
      // Cache for one day
      var expires = Date.now() * (60 * 60 * 24);
      res.header("Cache-Control", "maxage=" + expires);
      next();
    });

    // Map static folders.
    Object.keys(options.folders).sort().reverse().forEach(function(key) {
      site.get(root + key + "/*", function(req, res, next) {
        // Find filename.
        var filename = req.url.slice((root + key).length);

        res.sendfile(path.join(options.folders[key] + filename));
      });
    });

    // Map static files.
    if (_.isObject(options.files)) {
      Object.keys(options.files).sort().reverse().forEach(function(key) {
        site.get(root + key, function(req, res) {
          return res.sendfile(options.files[key]);
        });
      });
    }

    // Serve favicon.ico.
    site.use(express.favicon(options.favicon));

    // Home page!
    site.get(/^\/(?:index.html)?/, function(req, res) {
      fs.createReadStream(options.index).pipe(res);
    });

    // Actually listen
    site.listen(options.port, options.host);
  });

};
