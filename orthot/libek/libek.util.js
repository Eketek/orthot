
libek.util = {
  objprop:function(obj, name, defaultVal) {
    if (obj[name]) {
      return obj[name]
    }
    else {
      obj[name] = defaultVal
    }
    return defaultVal
  },
  
  flatten:function(arr, levels=1000) {
    let r = []
    let doFlatten = function(arr, level) {
      for (let v of arr) {
        if (Array.isArray(v) && level > 0) {
          doFlatten(v, levels-1)
        }
        else {
          r.push(v)
        }
      }
    }
    if (Array.isArray(arr)) {
      doFlatten(arr, levels)
    }
    else {
      r.push(arr)
    }
    return r
  },
  property:function(name, objects, defaultVal, transform,) {
    if (!Array.isArray(objects)) {
      objects = [objects]
    }
    for (let obj of objects) {
      if (obj && obj[name] != undefined) {
        if (transform) {
          return transform(obj[name])
        }
        else {
          return obj[name]
        }
      }
    }
    return defaultVal
  },
  properties_fromstring:function(data, entry_separator=':', field_separator='=') {
    let entries = data.split(entry_separator)
    let r = {}
    for (let entry of entries) {
      let spltloc = entry.indexOf('=')
      let fname = entry.substring(0, spltloc)
      let fval = entry.substring(spltloc+1)
      if (fval == undefined) {
        r[fname] = true
      }
      else {
        r[fname] = fval
      }
    }
    return r
  },
  parseVec3:function(arg) {
    let parts = arg.split(',')
    return new THREE.Vector3(
      parts[0] ? Number.parseFloat(parts[0]) : 0,
      parts[1] ? Number.parseFloat(parts[1]) : 0,
      parts[2] ? Number.parseFloat(parts[2]) : 0,
    )
  },
  color:{
    parse:function(arg) {
      let r,g,b
      if (typeof(arg) == "string") {
        let fail = false
        let parts = arg.split(',')
        switch(parts[0]) {
          case "rgba":
            r = parts[1]
            g = parts[2]
            b = parts[3]
          break
          default:
            let c = new THREE.Color(arg)
            r = c.r
            g = c.g
            b = c.b
          break
        }
      }
      else if (Array.isArray(arg)) {
        r = color_arg[0]
        g = color_arg[1]
        b = color_arg[2]
      }
      else if (arg) {
        if (arg.isColor) {
          r = arg.r
          g = arg.g
          b = arg.b
        }
      }
      return new THREE.Color(
        Math.min(1, Math.max(0,r)),
        Math.min(1, Math.max(0,g)),
        Math.min(1, Math.max(0,b))
      )
    },
    toBinary:function(arg) {    
      let c = libek.util.color.parse(arg)
      return (Math.round(c.r*255) << 16) | ( Math.round(c.g*255) << 8 ) | ( Math.round(c.b*255) )
    }
  }
}


