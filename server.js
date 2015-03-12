var fs = require("fs")
var restify = require("restify")
var Package = require("./lib/package")
var program = require('commander')

var packageWithoutVersionPattern = /^\/([^@]+)[\/]?$/ // {name}
var packageFilePattern = /^\/(.*)@(\d+\.\d+\.\d+)[\/]?(.*)$/ // {name}@{version}/{filepath}
program
  .version('2.0.0')
  .option('-p, --port <number>', 'Set the port on which to listen', parseInt)
  .option('-r, --registry <url>', 'Set a custom registry url')
  .parse(process.argv)

var port = Number(process.env.PORT || program.port || 8080)
var registry = program.registry || "http://registry.npmjs.org/"

function serveFile(req, res, next) {
  req.log.info("server", req.url)
  var name =    req.params[0]
  var version = req.params[1]
  var file =    req.params[2]
  var pkg = new Package(name, version)

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
  console.log("redirectToVersionedPackage", req.params[0])
  require("superagent").get(registry + req.params[0], function(rez){
    if (!rez.ok) {
      return res.send(404, {error: "package not found: " + req.params[0]})
    }

    var pkg = rez.body
    res.header("Location", "/" + pkg.name + "@" + pkg["dist-tags"].latest)
    return res.send(302)
  })
}

var server = module.exports = restify.createServer()
server.use(restify.queryParser())
server.get(packageWithoutVersionPattern, redirectToVersionedPackage)
server.get(packageFilePattern, serveFile)
server.head(packageFilePattern, serveFile)
server.listen(port, function() {
  console.log("%s listening at %s", server.name, server.url);
});
