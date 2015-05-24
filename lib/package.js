var fmt = require("util").format
var request = require("request")
var tar = require("tar-fs")
var fs = require("fs")
var path = require("path")
var npm = require("npm")

var Package = module.exports = function Package(name, version, opts) {
  this.name = name
  this.version = version
  this.opts = opts || {}
};

Package.prototype = {
  get directory() {
    return path.resolve(this.opts.cacheDir, this.name, this.version)
  },
  get tarball_url() {
    var registry = this.opts.registry || "http://registry.npmjs.org/"
    console.log("registry: ", registry)
    return fmt(registry + "%s/-/%s-%s.tgz", this.name, this.name, this.version)
  },
  get is_cached() {
    return fs.existsSync(this.directory)
  },
  get json() {
    return require(path.resolve(this.directory, "package", "package.json"))
  }
}

Package.prototype.log = function(msg) {
  var _this = this

  if (_this.opts.verbose) {
    console.log(msg);
  }
}

Package.prototype.download = function(callback) {
  npm.load({}, function() {
    var npmPrefix = npm.config.get("prefix")
    var _this = this

    if (_this.is_cached) return callback(null);
    console.log("looking for linked module")

    if(fs.existsSync(path.join(npmPrefix, "lib/node_modules", this.name))) {
      console.log("found module ", this.name, " in ", npmPrefix)
      console.log("creating dir ", path.resolve(this.opts.cacheDir, this.name))
      fs.mkdirSync(path.resolve(this.opts.cacheDir, this.name))
      fs.mkdirSync(this.directory)
      fs.mkdirSync(path.resolve(this.opts.cacheDir, this.name, "package"))
      console.log("creating symlink ", path.join(npmPrefix, "lib/node_modules", this.name))
      console.log("in ", this.directory)
      fs.symlinkSync(
        path.join(npmPrefix, "lib/node_modules", this.name),
        path.resolve(this.directory, "package")
      )
      console.log("calling callback")
      callback(null)
    }
    else {
      _this.log("downloading tarball: " + this.tarball_url)

      request(this.tarball_url)
        .pipe(require("zlib").createGunzip())
        .pipe(tar.extract(this.directory))
        .on("finish", function(){
          _this.log("tarball downloaded: " + this.tarball_url)
          _this.buildFileTree(callback)
        })
        .on("error", callback)
    }
  }.bind(this))
}

Package.prototype.buildFileTree = function(callback) {
  var _this = this
  var finder = require('findit')(_this.directory)
  _this.files = []

  _this.log("building file tree")

  finder.on('file', function (file, stat) {
    _this.files.push(file.replace(_this.directory + "/package/", ""))
  });

  finder.on('end', function () {
    _this.log("built file tree", _this.files)
    _this.writeIndexFiles(callback)
  });
}

Package.prototype.writeIndexFiles = function(callback) {
  var _this = this
  var indexTemplate = require("handlebars").compile(
    fs.readFileSync(path.resolve(__dirname, "./index.template.hbs"), "utf-8")
  )

  _this.log("writing _index.json")

  fs.writeFileSync(
    path.resolve(_this.directory, "package", "_index.json"),
    JSON.stringify(_this.files, null, 2)
  )

  _this.log("writing _index.html")

  fs.writeFileSync(
    path.resolve(_this.directory, "package", "_index.html"),
    indexTemplate(_this)
  )

  _this.log("wrote index files")

  callback(null)

}

Package.prototype.streamFile = function(filename, callback) {
  var self = this
  var file = path.resolve(this.directory, "package", filename)

  this.download(function(err) {
    if (err) return callback(err);

    if (!fs.existsSync(file)) {
      return callback(Error("File not found: " + file))
    }

    if (filename === "package.json") {
      return callback(null, fs.createReadStream(file))
    }

    if (self.json.icon && self.json.icon === filename) {
      return callback(null, fs.createReadStream(file))
    }

    if (process.env.RESTRICTED_ACCESS) {
      return callback(Error("I only serve package.json files and package icons these days."))
    } else {
      return callback(null, fs.createReadStream(file))
    }

  })
}
