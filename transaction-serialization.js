const Web3 = require('web3')
const BN = Web3.utils.BN

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))

// const isSerializableElement = function (potentialElement) {
//   return potentialElement instanceof SimpleSerializableElement
// }

const isSerializableList = function (potentialList) {
  return potentialList instanceof SimpleSerializableList
}

const isSignatureList = function (potentialSigList) {
  var isList = isSerializableList(potentialSigList)
  var areSignatures = potentialSigList.elements_type === 'Signature'
  return isList && areSignatures
}

const isTransferList = function (potentialTransferList) {
  var isList = isSerializableList(potentialTransferList)
  var areTransfers = potentialTransferList.elements_type === 'TransferRecord'
  return isList && areTransfers
}

const getFieldBytes = function (field) { // TODO ADD THE RECURSIVE SERZN
  var typeChecker = field[1]
  if (typeChecker === web3.utils.isAddress) {
    return 20
  } else {
    return typeChecker(0) // type checker should always allow encoding 0 and when it does returns the number of bytes in encoding
  }
}

const getfieldsTotalBytes = function (fields) {
  var numBytes = 0
  for (var i = 0; i < fields.length; i++) {
    numBytes += getFieldBytes(fields[i])
  }
  return numBytes
}

// input: encoding of SimpleSerializableElement as byte array,
//       element schema
//
// output: SimpleSerializableelement
const decodeElement = function (encoding, schema) {
  var decodedFields = []
  var fields = schema.fields
  console.assert(encoding.length === getfieldsTotalBytes(fields), 'whoops--the encoding is the wrong length for this schema')
  var currentPos = 0
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i]
    var fieldTypeChecker = field[1]
    var fieldBytesLen = getFieldBytes(field)
    var byteSlice = encoding.slice(currentPos, currentPos + fieldBytesLen)
    if (fieldTypeChecker === web3.utils.isAddress) {
      decodedFields[i] = decodeAddress(byteSlice)
    } else {
      decodedFields[i] = new BN(byteSlice)
    }
    currentPos += fieldBytesLen
  }
  return new SimpleSerializableElement(decodedFields, schema)
}

// input: encoding of SimpleSerializableList as a byte array,
//       elements' schema
//
// output: SimpleSerializableList
const decodeList = function (encoding, schema) {
  var numElements = encoding[0] // first byte is number of elements
  var elementLen = new BN(encoding.slice(1, 4)).toNumber() // next three is their size
  var elements = []
  for (var i = 0; i < numElements; i++) {
    var startPos = 4 + i * elementLen
    var endPos = startPos + elementLen
    var slice = encoding.slice(startPos, endPos)
    elements[i] = decodeElement(slice, schema)
  }
  return new SimpleSerializableList(elements, schema)
}

// A deserialized object.  Invoke with new SSE([values],schemas.schema)
// Allows for encoding with .encode(), decode with decodeElement(encoding,schemas.schema)
// Check type via element.elementType property (returns string)
class SimpleSerializableElement {
  constructor (values, schema) {
    this.elementType = schema.typeName
    this.fields = schema.fields
    this.numFields = this.fields.length
    console.assert(this.numFields > 0, 'whoops--schema is empty')
    console.assert(this.numFields === values.length, 'whoops--passed different sized array than number of fields in schema')
    for (var i = 0; i < this.numFields; i++) {
      var field = this.fields[i]
      var typeChecker = field[1]
      let value
      if (typeChecker === web3.utils.isAddress) {
        value = values[i]
      } else {
        value = new BN(values[i])
      }
      console.assert(field[1](value), 'whoops--type checker failed for the ' + i + 'th value')
      this[field[0]] = value
    }
  }

  encode () {
    var encoding = []
    for (var i = 0; i < this.fields.length; i++) {
      var bytesToAdd = []
      var field = this.fields[i]
      var fieldName = field[0]
      var fieldChecker = field[1]
      var encodingFunction = field[2]
      var fieldValue = this[fieldName]
      console.assert(fieldChecker(fieldValue), 'whoops--type checker failed for the ' + i + 'th value')
      bytesToAdd = encodingFunction(fieldValue)
      encoding = encoding.concat(bytesToAdd)
    }
    return encoding
  }
}

// A deserialized List.  Invoke with new SSL([values],schemas.schema)
// Allows for encoding with .encode(), decode with decodeList(encoding,schemas.schema)
// Check elements' type via element.elements_type property (returns string)
class SimpleSerializableList {
  constructor (inputElements, schema) {
    this.elements_type = schema.typeName
    this.numElements = inputElements.length
    this.elements = []
    console.assert(inputElements[0] instanceof SimpleSerializableElement, 'whoops--the first element isn\'t a SimpleSerializableElement object')
    for (var i = 0; i < this.numElements; i++) {
      console.assert(
        inputElements[i % this.numElements].fields ===
        inputElements[(i + 1) % this.numElements].fields
        , 'whoops--one of the elements in the array isn\'t a serializable object!') // make sure all same type
      this.elements[i] = inputElements[i]
    }
  }

  encode () {
    var encoding = []
    encoding[0] = new BN(this.numElements).toArray('be', 1)[0]
    var numBytesPerElement = new BN(
      getfieldsTotalBytes(this.elements[0].fields)
    )
    encoding = encoding.concat(numBytesPerElement.toArray('be', 3))
    for (var i = 0; i < this.numElements; i++) {
      var elementEncoding = this.elements[i].encode()
      encoding = encoding.concat(elementEncoding)
    }
    return encoding
  }
}

const isIntExpressibleInBytes = function (numBytes) {
  return function (i) {
    var b = new BN(i).toArray()
    if (b.length <= numBytes) {
      return numBytes
    } else {
      return false
    }
  }
}

const intToNBytes = function (numBytes) {
  return function (numToEncode) {
    var array = numToEncode.toArray('be', numBytes)
    return array
  }
}

const encodeAddress = function (address) {
  var without0x = address.substring(2) // remove '0x' from string
  var array = new BN(without0x, 16).toArray('be', 20) // decode hex string to 20-long big endian array
  return array
}

const decodeAddress = function (encodedAddr) {
  var asBN = new BN(encodedAddr, 'be')
  return '0x' + asBN.toString(16, 40) // 40-long hex string
}

// const selfEncode = function (element) {
//   return element.encode()
// }

// This is the schemas object which allows us
// to define new serializations, like so:
// [{schema:{
//     typeName:'name',
//     fields:[
//         ['field_name', type_checker_function, encodingFunction]
//     ]
// }}]
// !!!!NOTE!!!! -- we must pass byte arrays instead of JS numbers if the number exceeds 2^53
var schemas = {
  TransferRecord: {
    typeName: 'TransferRecord',
    fields: [
      ['sender', web3.utils.isAddress, encodeAddress],
      ['recipient', web3.utils.isAddress, encodeAddress],
      ['type', isIntExpressibleInBytes(4), intToNBytes(4)],
      ['start', isIntExpressibleInBytes(12), intToNBytes(12)],
      ['offset', isIntExpressibleInBytes(12), intToNBytes(12)],
      ['block', isIntExpressibleInBytes(32), intToNBytes(32)]
    ]
  },
  Signature: {
    typeName: 'Signature',
    fields: [
      ['v', isIntExpressibleInBytes(32), intToNBytes(32)],
      ['r', isIntExpressibleInBytes(32), intToNBytes(32)],
      ['s', isIntExpressibleInBytes(32), intToNBytes(32)]
    ]
  }
}

class Transaction {
  constructor (TRList, sigList) {
    console.assert(TRList.length === sigList.length, 'OOPS--passed a sig list and TR list of different lengths')
    console.assert(isTransferList(TRList), 'OOPs -- you didn\'t pass a simpleserializablelist list of TRs')
    console.assert(isSignatureList(sigList), 'OOPS -- you didn\'t pass a simpleserializablelist list of TRs')
    this.transferRecords = TRList
    this.signatures = sigList
  }
  encode () {
    return this.transferRecords.encode().concat(this.signatures.encode())
  }
}

const decodeTransaction = function (encoding) {
  var numTRs = encoding[0]
  var totalTRBytes = 4 + numTRs * getfieldsTotalBytes(schemas.TransferRecord.fields)
  var numSigs = encoding[totalTRBytes] // first byte after the transactions
  console.assert(numTRs === numSigs, 'oops-- badly formed transaction encoding :(')
  var TRSlice = encoding.slice(0, totalTRBytes) // first totalTRBytes
  var sigSlice = encoding.slice(totalTRBytes) // this gets the rest
  var TRList = decodeList(TRSlice, schemas.TransferRecord)
  var sigList = decodeList(sigSlice, schemas.Signature)
  return new Transaction(TRList, sigList)
}

module.exports = {
  schemas: schemas,
  SimpleSerializableElement: SimpleSerializableElement,
  SimpleSerializableList: SimpleSerializableList,
  decodeElement: decodeElement,
  decodeList: decodeList,
  encodeAddress: encodeAddress,
  decodeAddress: decodeAddress,
  Transaction: Transaction,
  decodeTransaction: decodeTransaction
}
