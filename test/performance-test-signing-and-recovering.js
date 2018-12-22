function runTest () { // eslint-disable-line no-unused-vars
  const Web3 = require('web3')
  const web3 = new Web3('ws://localhost:8546')
  const testPrivateKey = '0x55d5a0faa78131c313390567a8e6efc2a8df714f187549331794f6d805de03db'

  const myAcct = web3.eth.accounts.privateKeyToAccount(testPrivateKey)

  // Generate messages to sign
  const msgs = []
  for (let i = 0; i < 1000; i++) {
    msgs.push(web3.eth.accounts.hashMessage(i.toString()))
  }

  const signingStartTime = +new Date()
  const signedMsgs = []
  // Sign messages
  for (let msg of msgs) {
    signedMsgs.push(myAcct.sign(msg))
  }
  const signingEndTime = +new Date()
  console.log('Time to sign 1000 txs: ' + (signingEndTime - signingStartTime))

  console.log(signedMsgs[0])

  const recoveringStartTime = +new Date()
  // Recover messages
  for (let signedMsg of signedMsgs) {
    web3.eth.accounts.recover(signedMsg)
  }
  const recoveringEndTime = +new Date()
  console.log('Time to recover 1000 txs: ' + (recoveringEndTime - recoveringStartTime))
}

// runTest()
// On my 3 year old laptop I got:
// Time to sign 1000 txs: 0.896
// Time to recover 1000 txs: 1.888
