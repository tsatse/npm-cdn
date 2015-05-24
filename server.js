var fs = require("fs")
var path = require("path")
var restify = require("restify")
var program = require("commander")
var npm = require("npm")
var Package = require("./lib/package")

var defaultRegistryUrl = "http://registry.npmjs.org"
var defaultCacheDirectory = "/tmp/npm-cdn"
var packageWithoutVersionPattern = /^\/([^@\/]+)[\/]?(.*)$/ // {name}/{filepath}
var packageFilePattern = /^\/(.*)@(\d+\.\d+\.\d+)[\/]?(.*)$/ // {name}@{version}/{filepath}
program
  .version("2.0.0")
  .option("-p, --port <number>", "Set the port on which to listen", parseInt)
  .option("-r, --registry <url>", "Set the npm registry url (default is http://" + defaultRegistryUrl +")")
  .option("-c, --cache-dir <directory>", "Set the cache directory (default is " + defaultCacheDirectory +")")
  .parse(process.argv)

var port = Number(process.env.PORT || program.port || 8080)
var registry = program.registry || "http://registry.npmjs.org/"

function serveFile(req, res, next) {
  req.log.info("server", req.url)
  var name =    req.params[0]
  var version = req.params[1]
  var file =    req.params[2]
  var pkg = new Package(name, version, {registry: registry, cacheDir: program.cacheDir || defaultCacheDirectory})

  // Show generated index if filename is absent
  if (!file) {
    if (req.headers.accept.match(/json/) || "json" in req.query){
      file = "_index.json"
    } else {
      file = "_index.html"
    }
  }

  pkg.streamFile(file, function(err, stream) {
    if (err) {
      req.log.debug(req.url, err)
      return res.send(404, {error: err.message})
    }
    stream.pipe(res)
    next()
  })
}

function redirectToVersionedPackage(req, res, next) {
  console.log("redirectToVersionedPackage", req.params[0], "with path", req.params[1])
  npm.load({}, function() {
    var npmPrefix = npm.config.get("prefix")
    var linkedModulePath = path.join(npmPrefix, "lib/node_modules",  req.params[0])

    console.log("checking whether ", linkedModulePath, "exists")
    if(fs.existsSync(linkedModulePath)) {
      console.log("it exists")
      var pkg = fs.readFileSync(path.join(linkedModulePath, "package.json"))
      console.log("just read ", path.join(linkedModulePath, "package.json"))
      pkg = JSON.parse(pkg)
      console.log("and parsed it to ", pkg)
      var redirPath = "/" + pkg.name + "@" + pkg.version;
      if(req.params[1]) {
        redirPath += "/" + req.params[1]
      }
      res.header("Location", redirPath)
      console.log("now redirecting to ", redirPath)
      return res.send(302)
    }
    else {
      require("superagent").get(registry + req.params[0], function(rez){
        if (!rez.ok) {
          return res.send(404, {error: "package not found: " + req.params[0]})
        }

        var pkg = rez.body
        var redirPath = "/" + pkg.name + "@" + pkg["dist-tags"].latest;
        if(req.params[1]) {
          redirPath += "/" + req.params[1]
        }
        res.header("Location", redirPath)
        return res.send(302)
      })
    }
  });
}

var server = module.exports = restify.createServer()
server.use(restify.queryParser())
server.get(packageFilePattern, serveFile)
server.get(packageWithoutVersionPattern, redirectToVersionedPackage)
server.head(packageFilePattern, serveFile)
server.listen(port, function() {
  console.log("%s listening at %s", server.name, server.url);
});
