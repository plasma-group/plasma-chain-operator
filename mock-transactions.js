const sampleTr = {
  sender: 0,
  recipient: 0,
  type: 0,
  start: 0,
  offset: 0,
  block: 0
}

const sig = {
  v: 0,
  r: 0,
  s: 0
}

const tx = {
  transferRecords: [sampleTr],
  signatures: [sig]
}

console.log(tx)
