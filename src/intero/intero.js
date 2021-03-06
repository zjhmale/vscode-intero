let cp           = require('child_process')
let EventEmitter = require('events').EventEmitter
let vscode       = require('vscode')

let reg = /\(\d+,\d+\)-\(\d+,\d+\)/g

class Intero extends EventEmitter {
  constructor() {
    super()
    this.process = null
    this.buffer = ''
  }

  start() {
    if ((this.process == null) || !this.process.connected) {
      let pathToStack = 'stack'
      let params = [
        'ghci',
        '--with-ghc',
        'intero',
        '--no-build',
        '--no-load'
      ]

      let root = vscode.workspace.rootPath

      let options = {
        cwd: root
      }

      this.process = cp.spawn(pathToStack, params, options)

      this.process.on('error', this.error)
      this.process.on('exit', this.exited)
      this.process.on('close', this.exited)
      this.process.on('disconnect', this.exited)

      if (this.process.pid) {
        this.process.stdout.setEncoding('utf8').on('data', (data) => { this.stdout(data) })
      }
    }
  }

  send(cmd) {
    console.log("send cmd => " + cmd)
    return this.process.stdin.write(cmd)
  }

  stop() {
    if (this.process != null) {
      this.process.kill()
    }
  }

  error(error) {
    let msg = error.code == 'ENOENT' 
      ? "Couldn't find stack executable at \"" + error.path + "\""
      : error.message + '(' + error.code + ')'
    vscode.window.showErrorMessage(msg)
  }

  exited(code, signal) {
    if(signal == "SIGTERM") {
      let msg = "Stack was closed"
      vscode.window.showInformationMessage(msg)
    } else {
      let short = "Stack was closed or crashed"
      let long = signal
        ? "It was closed with the signal: " + signal
        : "It (probably) crashed with the error code: " + code
      vscode.window.showErrorMessage(short + " " + long)
    }
  }

  stdout(data) {
    this.buffer += data
    
    if (this.buffer.indexOf("Prelude>") > -1) {
      this.send(":set prompt \"\\4\"\n")
      this.buffer = ''
    }

    if (this.buffer.indexOf("Ok, modules loaded") > -1) {
      console.log("load file success")
      this.buffer = ''
      this.emit('message', {
        loadStatus: 'ok'
      })
    }

    if (this.buffer.indexOf("Failed, modules loaded") > -1) {
      console.log("load file failed")
      this.buffer = ''
      this.emit('message', {
        loadStatus: 'failed'
      })
    }

    if (this.buffer.indexOf("\n") > -1) {
      if (!(this.buffer.indexOf("Compiling") > -1 && this.buffer.indexOf("interpreted") > -1)) {
        //:type-at fresh :: Type -> NonGeneric -> Infer Type
        if (this.buffer.indexOf("::") > -1) {
          console.log("typeat => " + this.buffer)
          this.emit('message', {
            type: 'type',
            msg: this.buffer 
          })
        }

        //:uses :loc-at Users/zjh/Documents/haskellspace/ntha/src/Ntha/Type/Infer.hs:(31,1)-(31,6)
        if (reg.test(this.buffer)) {
          console.log("locat => " + this.buffer)
          this.emit('message', {
            type: 'definition',
            msg: this.buffer
          })
        }
      }
      this.buffer = ''
    }
  }
}

module.exports = Intero
