const path = require('path')
const fs = require('fs')
const plasmaChainCompiled = require('plasma-contracts').plasmaChainCompiled
const plasmaRegistryCompiled = require('plasma-contracts').plasmaRegistryCompiled
const Web3 = require('web3')
const ganache = require('ganache-cli')
const log = require('debug')('info:eth')
const PLASMA_CHAIN_ADDRESS_FILENAME = require('./constants.js').PLASMA_CHAIN_ADDRESS_FILENAME

// ES short for EthService
// `web3` & `plasmaChain` start as uninitialized because the startup script must be run before we can interact meaningfully with our node
const es = {
  web3: 'UNINITIALIZED',
  plasmaChain: 'UNINITIALIZED',
  operatorAddress: 'UNINITIALIZED',

  // Startup function called to initialize everything
  startup: async (config) => {
    // TODO: Remove this and replace with proper account management
    es.web3 = new Web3()
    _addTestWalletsToWeb3(es.web3)
    es.operatorAddress = es.web3.eth.accounts.wallet[0].address
    // Check if we are in test mode
    if (process.env.NODE_ENV === 'test') {
      await initializeTestingEnv(config)
    } else {
      await initializeProdEnv(config)
    }
    // Create our plasma chain es.web3 object, this will point to an existing Ethereum smart contract
    const plasmaChainAddress = fs.readFileSync(path.join(config.dbDir, PLASMA_CHAIN_ADDRESS_FILENAME), 'utf8')
    es.plasmaChain = new es.web3.eth.Contract(plasmaChainCompiled.abi, plasmaChainAddress)
    console.log('Plasma Chain address:', plasmaChainAddress)
  }
}

async function initializeTestingEnv (config) {
  // First get our es.web3 object which we will use. This comes with some wallets that have $ in them
  _setupTestProvider(es.web3)
  // Deploy a new Plasma Registry
  await deployNewPlasmaRegistry(config)
  // Deploy our new Plasma Chain and save it in a file
  const plasmaContractAddress = await deployNewPlasmaChain(es.web3, config)
  console.log('Testing mode enabled so deployed a new Plasma chain')
  fs.writeFileSync(path.join(config.dbDir, PLASMA_CHAIN_ADDRESS_FILENAME), plasmaContractAddress)
}

async function deployNewPlasmaRegistry (config) {
  // Deploy a new PlasmaRegistry. This requires first deploying a dummy Plasma Chain
  // We have the compiled contracts, let's create objects for them...
  const plasmaChainCt = new es.web3.eth.Contract(plasmaChainCompiled.abi, es.operatorAddress, {from: es.operatorAddress, gas: 3500000, gasPrice: '300000'})
  const plasmaRegistryCt = new es.web3.eth.Contract(plasmaRegistryCompiled.abi, es.operatorAddress, {from: es.operatorAddress, gas: 3500000, gasPrice: '300000'})
  // To set up the Plasma Network, we need to first deploy a Plasma Chain contract
  const plasmaChain = await plasmaChainCt.deploy({ data: plasmaChainCompiled.bytecode }).send()
  // Finally deploy the Plasma Registry and save the address in our config
  const plasmaRegistry = await plasmaRegistryCt.deploy({ data: plasmaRegistryCompiled.bytecode }).send()
  config.plasmaRegistryAddress = plasmaRegistry.options.address
  log('Deployed a Plasma Registry at', config.plasmaRegistryAddress)
  // Initialize the registry
  await plasmaRegistry.methods.initializeRegistry(plasmaChain.options.address).send()
}

async function initializeProdEnv (config) {
  if (config.web3HttpProvider === undefined) {
    throw new Error('Web3 provider undefined!')
  }
  es.web3.setProvider(new Web3.providers.HttpProvider(config.web3HttpProvider))
  // Check if we need to deploy a new Plasma registry. TODO: Save the deployed registry address automatically
  if (config.plasmaRegistryAddress === 'NONE') {
    await deployNewPlasmaRegistry(config)
    console.log('Deployed new registry to address:', config.plasmaRegistryAddress, '--save this in your config')
  }
  // Check if we have a Plasma Contract already deployed
  const plasmaChainAddressPath = path.join(config.dbDir, PLASMA_CHAIN_ADDRESS_FILENAME)
  if (!fs.existsSync(plasmaChainAddressPath)) {
    // Check that the plasma registry was deployed
    const plasmaRegistryCode = await es.web3.eth.getCode(config.plasmaRegistryAddress)
    if (plasmaRegistryCode === '0x') {
      throw new Error('No plasma registry found at address: ' + config.plasmaRegistryAddress)
    }
    // Deploy a new Plasma Chain and save it in a file
    const plasmaContractAddress = await deployNewPlasmaChain(es.web3, config)
    console.log('No Plasma Chain contract detected! Created a new one at address:', plasmaContractAddress)
    fs.writeFileSync(path.join(config.dbDir, PLASMA_CHAIN_ADDRESS_FILENAME), plasmaContractAddress)
  } else {
    console.log('Plasma Chain contract found!')
  }
}

async function deployNewPlasmaChain (web3, config) {
  // We have the compiled contracts, let's create objects for them...
  const plasmaRegistry = new web3.eth.Contract(plasmaRegistryCompiled.abi, config.plasmaRegistryAddress)
  const createPChainReciept = await plasmaRegistry.methods.createPlasmaChain(es.operatorAddress, Buffer.from(config.operatorIpAddress)).send({ from: es.operatorAddress, gas: 3500000, gasPrice: '300000' })
  const newPlasmaChainAddress = createPChainReciept.events.NewPlasmaChain.returnValues['0']
  log('Deployed a Plasma Chain at', newPlasmaChainAddress)
  return newPlasmaChainAddress
}

function _addTestWalletsToWeb3 (web3) {
  for (let i = 0; i < 100; i++) {
    web3.eth.accounts.wallet.add(web3.utils.sha3(i.toString()))
  }
}

function _setupTestProvider (web3) {
  const ganacheAccounts = []
  for (let i = 0; i < web3.eth.accounts.wallet.length; i++) {
    ganacheAccounts.push({
      balance: '0x100000000000000000000',
      secretKey: web3.eth.accounts.wallet[i].privateKey
    })
  }
  // For all provider options, see: https://github.com/trufflesuite/ganache-cli#library
  const providerOptions = {'accounts': ganacheAccounts, 'locked': false, 'logger': { log }}
  web3.setProvider(ganache.provider(providerOptions))
  // TODO: Remove this as it is squashing errors. See https://github.com/ethereum/web3.js/issues/1648
  web3.currentProvider.setMaxListeners(300)
}

module.exports = es
