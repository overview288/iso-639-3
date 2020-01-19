'use strict'

var fs = require('fs')
var path = require('path')
var https = require('https')
var concat = require('concat-stream')
var yauzl = require('yauzl')
var dsv = require('d3-dsv')
var bail = require('bail')

var found = false

var scopes = {
  I: 'individual',
  M: 'macrolanguage',
  S: 'special'
}

var types = {
  A: 'ancient',
  C: 'constructed',
  E: 'extinct',
  H: 'historical',
  L: 'living',
  S: 'special'
}

// Note:
// You can find download links here:
// <https://iso639-3.sil.org/code_tables/download_tables>
// Just get the complete code tables in UTF-8.

https
  .request(
    'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3_Code_Tables_20190408.zip',
    onrequest
  )
  .end()

function onrequest(res) {
  res
    .pipe(fs.createWriteStream('archive.zip'))
    .on('close', onclose)
    .on('error', bail)
}

function onclose() {
  yauzl.open('archive.zip', {lazyEntries: true}, onopen)
}

function onopen(err, archive) {
  bail(err)

  read()

  archive.on('entry', onentry)
  archive.on('end', onend)

  function onentry(entry) {
    if (path.basename(entry.fileName) !== 'iso-639-3_20190408.tab') {
      return read()
    }

    found = true
    archive.openReadStream(entry, onreadstream)
  }

  function onreadstream(err, rs) {
    bail(err)
    rs.pipe(concat(onconcat)).on('error', bail)
    rs.on('end', read)
  }

  function read() {
    archive.readEntry()
  }
}

function onend() {
  if (!found) {
    throw new Error('File not found')
  }
}

function onconcat(body) {
  var data = dsv.tsvParse(String(body)).map(map)
  var toB = {}
  var toT = {}
  var to1 = {}

  data.forEach(d => {
    var id = d.iso6393
    var b = d.iso6392B
    var t = d.iso6392T
    var i = d.iso6391

    if (b) toB[id] = b
    if (t) toT[id] = t
    if (i) to1[id] = i
  })

  write('index', data)
  write('to-1', to1)
  write('to-2b', toB)
  write('to-2t', toT)

  function write(name, data) {
    fs.writeFile(name + '.json', JSON.stringify(data, null, 2) + '\n', bail)
  }
}

function map(d) {
  var name = d.Ref_Name
  var id = d.Id
  var type = types[d.Language_Type]
  var scope = scopes[d.Scope]

  if (!name) {
    console.error('Cannot handle language w/o name', d)
  }

  if (!type) {
    console.error('Cannot handle language w/o type', d)
  }

  if (!scope) {
    console.error('Cannot handle language w/o scope', d)
  }

  if (!id) {
    console.error('Cannot handle language w/o scope', d)
  }

  return {
    name: name,
    type: type,
    scope: scope,
    iso6393: id,
    iso6392B: d.Part2B || undefined,
    iso6392T: d.Part2T || undefined,
    iso6391: d.Part1 || undefined
  }
}
