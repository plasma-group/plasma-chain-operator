const TS = require('plasma-utils').encoder
const BN = require('web3').utils.BN

const genRandomNByteBN = function (numBytes) { // returns an int not byte array
  let arr = []
  for (let i = 0; i < numBytes; i++) {
    arr.push(Math.floor(Math.random() * (256)))
  }
  return new BN(arr)
}

const genRandomAddress = function () {
  const addr = genRandomNByteBN(20)
  return TS.decodeAddress(addr)
}

const genRandomSignature = function () {
  const v = genRandomNByteBN(32)
  const r = genRandomNByteBN(32)
  const s = genRandomNByteBN(32)
  return new TS.Sig([v, r, s])
}

const genSequentialTR = function (prevTR) {
  const sender = genRandomAddress()
  const recipient = genRandomAddress()
  const start = prevTR.end.add(genRandomNByteBN(6))
  const end = start.add(genRandomNByteBN(6)).add(new BN(1)) // add 1 in case 0 though lol never gonna happen
  const block = 0
  const type = 0
  return new TS.TR([sender, recipient, type, start, end, block])
}

const genSequentialTransaction = function (prevTransaction) {
  const TRList = new TS.TRList([genSequentialTR(prevTransaction.transferRecords.elements[0])])
  return new TS.Transaction(TRList, [genRandomSignature()])
}

const genNSequentialTransactions = function (n) {
  let TXList = []
  //
  TXList[0] = new TS.Transaction([['0x43aadf3d5b44290385fe4193a1b13f15ef3a4fd5', '0x43aadf3d5b44290385fe4193a1b13f15ef3a4fd5', 0, 0, 1, 0]], [genRandomSignature()])
  TXList[0].TRIndex = 0
  for (let i = 1; i < n; i++) {
    TXList[i] = genSequentialTransaction(TXList[i - 1])
    TXList[i].TRIndex = 0
  }
  return TXList
}

const genNSequentialTransactionsSpacedByOne = function (n) {
  let TXList = []
  //
  TXList[0] = new TS.Transaction([['0x43aadf3d5b44290385fe4193a1b13f15ef3a4fd5', '0x43aadf3d5b44290385fe4193a1b13f15ef3a4fd5', 0, 0, 1, 0]], [genRandomSignature()])
  TXList[0].TRIndex = 0
  for (let i = 1; i < n; i++) {
    TXList[i] = new TS.Transaction([['0x43aadf3d5b44290385fe4193a1b13f15ef3a4fd5', '0x43aadf3d5b44290385fe4193a1b13f15ef3a4fd5', 0, i, i + 1, 0]], [genRandomSignature()])
    TXList[i].TRIndex = 0
  }
  return TXList
}

module.exports = {
  genNSequentialTransactions,
  genNSequentialTransactionsSpacedByOne
}
