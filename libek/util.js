export {
  objprop, property, mergeObjects, properties_fromstring,
  clamp,
  flatten, anythingIN,
  parseVec3, parseColor, toBinColor,
  putFloatingElement, centerElementOverElement
}
var objprop = function(obj, name, defaultVal) {
  if (obj[name]) {
    return obj[name]
  }
  else {
    obj[name] = defaultVal
  }
  return defaultVal
}
var clamp = function(val, min, max) {
  return ((val < min) ? min : ((val > max) ? max : val))
}

var flatten = function(arr, levels=1000) {
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
}

var anythingIN = function(obj) {
  for (let k in obj) {
    return true
  }
  return false
}

var property = function(name, objects, defaultVal, transform) {
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
}
var mergeObjects = function(objs) {
  let r = {}
  for (let obj of objs) {
    Object.assign(r, obj)
  }
  return r
}
var properties_fromstring = function(data, entry_separator=':', field_separator='=') {
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
}
var parseVec3 = function(arg) {
  let parts = arg.split(',')
  return new THREE.Vector3(
    parts[0] ? Number.parseFloat(parts[0]) : 0,
    parts[1] ? Number.parseFloat(parts[1]) : 0,
    parts[2] ? Number.parseFloat(parts[2]) : 0,
  )
}

var parseColor = function(arg) {
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
}
var toBinColor = function(arg) {
  let c = parseColor(arg)
  return (Math.round(c.r*255) << 16) | ( Math.round(c.g*255) << 8 ) | ( Math.round(c.b*255) )
}

var centerElementOverElement = function(element, target) {
  let elementRect = element.getBoundingClientRect()
  let targetRect = target.getBoundingClientRect()
  
  
  let cx = ((targetRect.width)-(elementRect.width))/2 + targetRect.left
  let cy = ((targetRect.height)-(elementRect.height))/2 + targetRect.top
  
  element.style.left = cx + "px"
  element.style.top = cy + "px"
}

var putFloatingElement = function(element, target) {
  let elementRect = element.getBoundingClientRect()
  let targetRect = target.getBoundingClientRect()
  let x = targetRect.left+window.scrollX
  let y = targetRect.bottom+window.scrollY
  let w = elementRect.width
  let h = elementRect.height

  if ( (x+w) > window.innerWidth) {
    x = targetRect.right-elementRect.width
  }
  if (x < 0) {
    x = 0
  }
  if (y < 0) {
    y = 0
  }
  if (y+h > window.height) {
    y = window.height - h
  }
  element.style.left = x + "px"
  element.style.top = y + "px"
}
















