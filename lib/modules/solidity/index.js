let async = require('../../utils/async_extend.js');
let SolcW = require('./solcW.js');

class Solidity {

  constructor(embark, options) {
    this.logger = embark.logger;
    this.events = embark.events;
    this.contractDirectories = options.contractDirectories;

    embark.registerCompiler(".sol", this.compile_solidity.bind(this));
  }

  compile_solidity(contractFiles, cb) {
    let self = this;
    let input = {};
    let solcW;
    async.waterfall([
      function prepareInput(callback) {
        async.each(contractFiles,
                   function(file, fileCb) {
                     let filename = file.filename;

                     for (let directory of self.contractDirectories) {
                       filename = filename.replace(directory, '');
                     }

                     file.content(function(fileContent) {
                      input[filename] = fileContent;
                      fileCb();
                     });
                   },
                   function (err) {
                     callback(err);
                   }
        );
      },
      function loadCompiler(callback) {
        // TODO: there ino need to load this twice
        solcW = new SolcW({logger: self.logger, events: self.events});
        if (solcW.isCompilerLoaded()) {
          return callback();
        }

        self.logger.info("loading solc compiler..");
        solcW.load_compiler(function (err) {
          callback(err);
        });
      },
      function compileContracts(callback) {
        self.logger.info("compiling contracts...");
        solcW.compile({sources: input}, 1, function (output) {
          if (output.errors) {
            for (let i=0; i<output.errors.length; i++) {
              if (output.errors[i].indexOf('Warning:') >= 0) {
                //return callback(new Error("Solidity errors: " + output.errors).message);
              }
              if (output.errors[i].indexOf('Error:') >= 0) {
                return callback(new Error("Solidity errors: " + output.errors).message);
              }
            }
            self.logger.warn(output.errors.join('\n'));
          }
          callback(null, output);
        });
      },
      function createCompiledObject(output, callback) {
        let json = output.contracts;

        if (Object.keys(output.contracts).length === 0 && output.sourceList.length > 0) {
          return callback(new Error("error compiling. There are sources available but no code could be compiled, likely due to fatal errors in the solidity code").message);
        }

        let compiled_object = {};

        for (let contractName in json) {
          let contract = json[contractName];

          // Pull out filename:classname
          // [0] filename:classname
          // [1] filename
          // [2] classname
          const regex = /(.*):(.*)/;
          const className = contractName.match(regex)[2];
          const filename = contractName.match(regex)[1];

          compiled_object[className] = {};
          compiled_object[className].code = contract.bytecode;
          compiled_object[className].runtimeBytecode = contract.runtimeBytecode;
          compiled_object[className].realRuntimeBytecode = contract.runtimeBytecode.slice(0, -68);
          compiled_object[className].swarmHash = contract.runtimeBytecode.slice(-68).slice(0, 64);
          compiled_object[className].gasEstimates = contract.gasEstimates;
          compiled_object[className].functionHashes = contract.functionHashes;
          compiled_object[className].abiDefinition = JSON.parse(contract.interface);
          compiled_object[className].filename = filename;
        }

        callback(null, compiled_object);
      }
    ], function (err, result) {
      cb(err, result);
    });
  }

}

module.exports = Solidity;
