// Reader object to handle binary data generated with C# System.IO.BinaryWriter
libek.DataReader = function x(dview, little_endian=true) {
  this.dview = dview
  this.pos = 0
  let e8 = 2**8
  let e16 = 2**16
  let e32 = 2**32
  this.seek = function(p) { pos = p }
  
  this.readBool = function() { 
    let r = dview.getUint8(this.pos)
    this.pos++ 
    return r != 0
  }
  
  this.readSByte = function() { 
    let r = dview.getInt8(this.pos)
    this.pos++ 
    return r
  }
  this.readUByte = function() { 
    let r = dview.getUint8(this.pos)
    this.pos++ 
    return r
  }
  
  this.readSShort = function() { 
    let r = dview.getInt16(this.pos, little_endian)
    this.pos+=2
    return r
  }
  this.readUShort = function() { 
    let r = dview.getUint16(this.pos, little_endian)
    this.pos+=2
    return r
  }
  
  this.readSInt = function() { 
    let r = dview.getInt32(this.pos, little_endian)
    this.pos+=4
    return r
  }
  this.readUInt = function() { 
    let r = dview.getUint32(this.pos, little_endian)
    this.pos+=4
    return r
  }
  
  this.readFloat = function() { 
    let r = dview.getFloat32(this.pos, little_endian)
    this.pos+=4
    return r
  }
  this.readDouble = function() { 
    let r = dview.getFloat64(this.pos, little_endian)
    this.pos+=8
    return r
  }
  
  
  // Presumably, an encoded string length
  this.read_7bitEncodedInt = function() {  
    let b = 128
    let v = 0
    while (b&128) {
      b = this.readUByte()
      v = v<<7|b&127      
    }
    return v
  }
  this.readString = function(maxStrLen=-1) {
    let len = this.read_7bitEncodedInt()
    if (len < 0) {
      throw new Error(`String read failed: declared length is negative (${len})`)
    }
    else if ( (maxStrLen != -1) && (len > maxStrLen) ) {
      throw new Error(`String read failed: declared length exceeds maximum (length=${len}, maximum=${maxStrLen})`)
    }
    let bytes = new Array(len)    
    for (let i = 0; i < len; i++) {
      bytes[i] = this.readUByte()
    }
    return String.fromCharCode.apply(null, bytes)
  }
}