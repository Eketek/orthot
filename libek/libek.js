export {
  initLIBEK, getUID, Display,
  trit, tt, T, PI, rad_tosector, pickAgainstPlane, AXIS,
  delay,
  getAsset, storeAsset, releaseAsset,
  Material, assignMaterials,
  getChildrenRecursive,
  load, loadMuch, loadZIP, load_to_ArrayBuffer, fetchText,
  debug_tip
}
import { flatten } from './util.js'
import { EkvxLoader, EkvxLoaderLoader } from './ekvx.js'
import { animtext_Loader, parse_Animtext } from './animtext.js'

var PI = Math.PI
var T = Math.PI*2     // "turn"
var tt = function(strings, ... params) {
  return {
    isTaggedTemplate:true,
    strings:strings,
    params:params
  }
}

var trit = {
  false:0,
  FALSE:0,
  true:1,
  TRUE:1,
  maybe:2,
  MAYBE:2
}

var _uid = 0
var getUID = function() {
  _uid++
  return _uid
}

  // Display Constructor.
  // Display is defined as a complete render chain.
  // For the time being, this is a renderer, a 3D scene, a camera, and a rendering trigger
  //  Possible additions to consider:
  //    rendering layers (background / skyboxes, GUI)
  //    subordinate renderers (render to in-scene texture)
  //    rendering callbacks (drawing / rendering deferred to other code/libraries)
var __Display = function disp(renderer, scene, camera) {
  this.renderer = renderer ? renderer : new THREE.WebGLRenderer({alpha:true})
  this.scene = scene ? scene : new THREE.Scene()
  this.camera = camera ? camera : new THREE.PerspectiveCamera( 45, 1, .1, 500 )

  this.render = function() {
    this.renderer.render( this.scene, this.camera )
  }
}

  // Initialize a DOM-resident Display with somewhat OK defaults
var Display = function( elem, background=false, foreground=false ) {
  if (elem.dataset.display) {
    return elem.dataset.display
  }

  let disp = new __Display()
  
  let w = elem.clientWidth
  let h = elem.clientHeight
  
  elem.dataset.display = disp
  disp.renderer.setSize( w, h )
  disp.camera.aspect = w / h
  disp.scene.add(disp.camera)
  disp.camera.updateProjectionMatrix()

  let backgroundElem, foregroundElem
  
  if (background) {
    backgroundElem = document.createElement("canvas")
    backgroundElem.width = w
    backgroundElem.height = h
    backgroundElem.style.width = w
    backgroundElem.style.height = h
    backgroundElem.style.position = "absolute"
    elem.appendChild( backgroundElem )
    disp.background = backgroundElem
  }
  disp.renderer.domElement.style.position = "absolute"
  elem.appendChild( disp.renderer.domElement )

  if (foreground) {
    foregroundElem = document.createElement("canvas")
    foregroundElem.width = w
    foregroundElem.height = h
    foregroundElem.style.width = w
    foregroundElem.style.height = h
    foregroundElem.style.position = "absolute"
    elem.appendChild( foregroundElem )
    disp.foreground = foregroundElem
  }
  
  on(window, "resize", ()=>{
    w = elem.clientWidth
    h = elem.clientHeight
    
    disp.renderer.setSize( w, h )
    disp.camera.aspect = w / h
    disp.camera.updateProjectionMatrix()
    
    if (background) {
      backgroundElem.width = w
      backgroundElem.height = h
      backgroundElem.style.width = w
      backgroundElem.style.height = h
    }
    if (foreground) {
      foregroundElem.width = w
      foregroundElem.height = h
      foregroundElem.style.width = w
      foregroundElem.style.height = h
    }
  })
  
  return disp
}

  // Compute 3D position by picking against a defined picking plane
var pickAgainstPlane = function(disp, pos, plane) {
  //Display coordinates at mouse position
  //let disp_x =  ((evt.pageX - evt.target.offsetLeft) / evt.target.clientWidth) * 2 - 1
  //let disp_y = -((evt.pageY - evt.target.offsetTop)  / evt.target.clientHeight) * 2 + 1

  //Convert to a Ray pointing from the mouse position
  let mray = new THREE.Ray()
  if ( disp.camera.isPerspectiveCamera ) {
    mray.origin.setFromMatrixPosition( disp.camera.matrixWorld );
    mray.direction.set( pos.x, pos.y, 0.5 ).unproject( disp.camera ).sub( mray.origin ).normalize();
  }
  else {
    mray.origin.set( pos.x, pos.y, ( disp.camera.near + disp.camera.far ) / ( disp.camera.near - disp.camera.far ) ).unproject( disp.camera );
    mray.direction.set( 0, 0, - 1 ).transformDirection( disp.camera.matrixWorld );
  }

  //Cast the Mouse-Ray onto the picking plane to compute the 3d mouse position
  let mpos3d = new THREE.Vector3()

  let _plane = plane.clone()
  _plane.constant *= -1

  mray.intersectPlane(_plane, mpos3d)
  //console.log(disp, pos, plane, "->", mray, mpos3d)
  return { ray:mray, pos:mpos3d }
}

var AXIS = { X:1, Y:2, Z:3 }

var storeAsset = function(assets, name, obj) {
  obj.__LIBEK_INST_ASSET_ID = name
  assets[name] = obj
}

  /*  Get a copy of a loaded asset
      This will either duplicate and return the named asset or fetch and return a pooled instance of it

      name:  Name of the asset
      dup:   Either a duplication function [accepting the object to duplicate] or the member name of a [zero-argument] duplication function belonging to the asset
              If false or undefined, this will return the asset without attempting to duplicate it

      ALSO:  If any of the object's materials or transformation properties are altered or any such properties on any children, set the obj.__ISDIRTY flag
              to ensure that it gets cleaned up when released(or clean it up manually)
  */
var getAsset = function(assets, arg, dup="clone") {
  let name
  if (typeof(arg) == "string") {
    name = arg
  }
  else if (arg.isObject3D) {
    let origOBJ = arg
    name = arg.__LIBEK_INST_ASSET_ID
    if (!name) {
      name = "ANON-OBJ-" + getUID()
      arg.__LIBEK_INST_ASSET_ID = name
      assets[name] = arg
    }
  }
  else {
    console.log("ERROR:  Can not getAsset whatever this is into something useful:", arg)
    return
  }
  let pool = _inst_asset_pool[name]
  if (!pool) {
    pool = []
    _inst_asset_pool[name] = pool
  }

  let obj = pool.pop()
  if (!obj) {
    let base = assets[name]
    if (!base) {
      console.log(`ERROR:  Asset named "${arg}" does not exist or is not loaded.`)
      return
    }
    if (dup) {
      switch(typeof(dup)) {
        case "function":  obj = dup(base); break;
        case "string":    obj = base[dup](); break
      }
      obj.__LIBEK_INST_ASSET_ID = name
    }
    else {
      return base
    }
  }
  return obj
}

  /*  Release an instance of an Asset
      This will store it in the instanced-assets pool
  */
var releaseAsset = function(assets, obj) {
  if (obj.parent) {
    obj.parent.remove(obj)
  }
  if (obj.__LIBEK_INST_ASSET_ID) {
    if (_inst_asset_pool[obj.__LIBEK_INST_ASSET_ID].indexOf(obj) == -1) {
      if (obj.__ISDIRTY) {
        obj.__ISDIRTY = false

        let base = assets[obj.__LIBEK_INST_ASSET_ID]
        cleanAsset(obj, base)
      }
      _inst_asset_pool[obj.__LIBEK_INST_ASSET_ID].push(obj)
    }
  }
  else {
    for (let subobj of obj.children) {
      releaseAsset(assets, subobj)
    }
  }
}

  // reset commonly adjusted properties to the values specified on the base object (and reset properties on children)
var cleanAsset = function(obj, base) {
  obj.matrix = new THREE.Matrix4()
  obj.matrixAutoUpdate = true
  obj.position.copy(base.position)
  obj.scale.copy(base.scale)
  obj.rotation.copy(base.rotation)

  if (obj.material) {
    obj.material = base.material
  }
  for (let i = 0; i < obj.children.length; i++) {
    cleanAsset(obj.children[i], base.children[i])
  }
}

var getChildrenRecursive = function(obj, r=[]) {
  if (obj.__LIBEK_INST_ASSET_ID) {
    r.push(obj)
  }
  else {
    for (let child of obj.children) {
      getChildrenRecursive(child, r)
    }
  }
  return r
}
  /*  Assign materials to a mesh-type object.
   */
var assignMaterials = function(mdl, ... materials) {
  materials = flatten(materials)
  if (materials) {
    for (let i = 0; i < Math.min(materials.length, mdl.children.length); i++) {

      let mat = materials[i]
      if (!mat.isMaterial) {
        mat = Material(mat)
      }
      mdl.children[i].material = mat
    }
  }
}
var _inst_asset_pool = {}

  /*  Generate a Material from a params object.

      params:
        type:  Material Constructor or Name of Material to use
                 This defaults to "MeshStandardMaterial" (generates a THREE.MeshStandardMaterial)
        shared:  Whether or not this should be a shared material (If called multiple times with equivalent params, only one instance will be generated)
                 This defaults to true
        *:     The entire params object is passed to the Material Constructor - everything else is Material properties
  */
var Material = function(params) {
  let props
  if (typeof(params) == "string") {
    params = { color:params }
  }
  else if (params.isColor) {
    params = {color:params}
  }

  if (!params.type) {
    params.type = DefaultMaterial
  }
  else {
    // If the actual constructor was passed in, backpedal a bit and attempt to find the actual name
    if (typeof(params.type) != "string") {
      for (let k in _Material_table) {
        if (params.type == _Material_table[k]) {
          params.type = k
        }
      }
    }
    // If an alternate material name is used, change to the actual name
    else if (_Material_nametable[params.type]) {
      params.type = _Material_nametable[params.type]
    }
  }

  if (params.shared == undefined) {
    params.shared = true
  }

  let propdesc = []
  for (let k in params) {
    let v = params[k]
    if (typeof(v) == "object") {
      if (v.isColor) {
        v = v.getHex()
      }
    }
    propdesc.push(k+":"+v)
  }
  propdesc.sort()
  let id = "cmat " + propdesc.join(' ')

  if (params.shared && _sharedmat_store[id]) {
    return _sharedmat_store[id]
  }

  let Material = params.type
  if (typeof(Material) == "string") {
    Material = _Material_table[params.type]
  }

  let mat = new Material(params)

  if (params.shared) {
    mat.__LIBEK_MATERIAL_ID = id
    _sharedmat_store[id] = mat
  }
  mat.__LIBEK_MATERIAL_PARAMS = params
  return mat
}
var _sharedmat_store= {}
var DefaultMaterial = "MeshStandardMaterial"

//Used by libek.Material() to map names to Material constructors
var _Material_table = {
  "LineBasicMaterial":THREE.LineBasicMaterial,
  "LineDashedMaterial":THREE.LineDashedMaterial,
  "LineBasicMaterial":THREE.LineBasicMaterial,
  "MeshBasicMaterial":THREE.MeshBasicMaterial,
  "MeshDepthMaterial":THREE.MeshDepthMaterial,
  "MeshLambertMaterial":THREE.MeshLambertMaterial,
  "MeshNormalMaterial":THREE.MeshNormalMaterial,
  "MeshPhongMaterial":THREE.MeshPhongMaterial,
  "MeshStandardMaterial":THREE.MeshStandardMaterial,
  "MeshToonMaterial":THREE.MeshToonMaterial,
  "PointsMaterial":THREE.PointsMaterial,
  "RawShaderMaterial":THREE.RawShaderMaterial,
  "ShaderMaterial":THREE.ShaderMaterial,
  "ShadowMaterial":THREE.ShadowMaterial,
  "SpriteMaterial":THREE.SpriteMaterial,
}
//Used by libek.Material() to
var _Material_nametable = {
  "LineBasicMaterial":"LineBasicMaterial",
  "LineDashedMaterial":"LineDashedMaterial",
  "LineBasicMaterial":"LineBasicMaterial",
  "MeshBasicMaterial":"MeshBasicMaterial",
  "MeshDepthMaterial":"MeshDepthMaterial",
  "MeshLambertMaterial":"MeshLambertMaterial",
  "MeshNormalMaterial":"MeshNormalMaterial",
  "MeshPhongMaterial":"MeshPhongMaterial",
  "MeshStandardMaterial":"MeshStandardMaterial",
  "MeshToonMaterial":"MeshToonMaterial",
  "PointsMaterial":"PointsMaterial",
  "RawShaderMaterial":"RawShaderMaterial",
  "ShaderMaterial":"ShaderMaterial",
  "ShadowMaterial":"ShadowMaterial",
  "SpriteMaterial":"SpriteMaterial",

  "LineBasic":"LineBasicMaterial",
  "LineDashed":"LineDashedMaterial",
  "LineBasic":"LineBasicMaterial",
  "MeshBasic":"MeshBasicMaterial",
  "MeshDepth":"MeshDepthMaterial",
  "MeshLambert":"MeshLambertMaterial",
  "MeshNormal":"MeshNormalMaterial",
  "MeshPhong":"MeshPhongMaterial",
  "MeshStandard":"MeshStandardMaterial",
  "MeshToon":"MeshToonMaterial",
  "Points":"PointsMaterial",
  "RawShader":"RawShaderMaterial",
  "Shader":"ShaderMaterial",
  "Shadow":"ShadowMaterial",
  "Sprite":"SpriteMaterial",

  "Basic":"MeshBasicMaterial",
  "Depth":"MeshDepthMaterial",
  "Lambert":"MeshLambertMaterial",
  "Normal":"MeshNormalMaterial",
  "Phong":"MeshPhongMaterial",
  "Standard":"MeshStandardMaterial",
  "Toon":"MeshToonMaterial",
}

var DisposeMaterial = function(mat) {
  if (mat.__LIBEK_MATERIAL_ID) {
    delete _sharedmat_store[id]
  }
  mat.dispose()
}

var STDLoader = {
  obj:new THREE.OBJLoader(),
  texture:new THREE.TextureLoader(),
  atxt:animtext_Loader,
  animtxt:animtext_Loader,
  ekvx:EkvxLoaderLoader
}

var loadOBJ = async function(url) {
  let cb
  let p = new Promise( resolve => { cb = resolve })

  loader.obj.load(url, obj => { cb(obj) } )

  return p
}


var load_to_ArrayBuffer = async function(url, fetchOPTS) {
  return new Promise( async resolve => {
    let resp = await fetch(url, fetchOPTS)
    let fr = new FileReader()

    fr.readAsArrayBuffer(await resp.blob())

    fr.onloadend = function() {
      resolve(fr.result)
    }
  })
}

var fetchText = async function(url, fetchOPTS) {
  return new Promise( async resolve => {
    let resp = await fetch(url, fetchOPTS)
    let text = await resp.text()
    resolve(text)
  })
}

var load = async function(url, loader, fetchOPTS) {

  let cb
  let p = new Promise( resolve => { cb = resolve })

  if (!loader) {
    let i = url.lastIndexOf('.')
    if (i != -1) {
      loader = STDLoader[url.substr(i+1)]
    }
  }

  if (loader) {
    if (loader.isLibekLoader) {   // A hack to allow test code to forcibly bypass the http cache
      loader.load(url, obj => { cb(obj) }, fetchOPTS )
    }
    else {
      loader.load(url, obj => { cb(obj) } )
    }
  }
  else {
    cb()
  }
  return p
}

  /* Load any number of resources concurrently, bind them to object properties, and return after all items are loaded.

      entries:  List of items to load.  These may be either simple url strings or params objects specifying a url, an optional name, and an optional loader

      entry params object:
        url:  A URL string
        name:  [Optional] A name to bind the loaded resource to - If not specified, loadMuch() will auto-assign one (url string between the last '/' and last '.')
        loader:  [Optional] A function which accepts a URL and passes the result to a callback when it completes - If not specified, libek.load() will select
                            one based on filename extension
  */
var loadMuch = async function(assets, override, fetchOPTS, ... entries) {
  entries = flatten(entries)
  let plist = new Array(entries.length)
  for (let i = 0; i < entries.length; i++) {
    let entry = entries[i]
    if (typeof(entry) == "string") {
      entries[i] = {url:entry}
      plist[i] = load(entry)
    }
    else {
      plist[i] = load(entry.url, entry.loader, fetchOPTS)
    }
  }
  await Promise.all(plist).then( vals => {
    for (let i = 0; i < entries.length; i++) {
      let entry = entries[i]
      let val = vals[i]
      let name = entry.name

      if (entry.properties) {
        Object.assign(val, entry.properties)
      }

      //If no name is specified, auto-generate one.  If you want your extension and forward slashes: Tough; Specify a name.
      if (!name) {
        name = entry.url
        let i = name.lastIndexOf('/')
        if (i != -1) {
          name = name.substring(i+1)
        }
        i = name.lastIndexOf('.')
        if (i != -1) {
          name = name.substring(0,i)
        }
      }
      if (!assets[name] || override) {
        assets[name] = val
      }
    }
  })
}

// Load assets from a remote zip file and stage the contents for use by the application
//  params:
//    assets:  An Associative array to attach the assets to
//      Each asset is assigned to assets.<AssetName>
//      Asset names default to whatever the name in the ZIP file (with filename extension removed)
//      Asset names can be overriden by specifying a name in the manifest file (*.mf)
//    url:  location to load the ZIP file from
//    fetch_options:  [optional] parameters to initialize the fetch()
var loadZIP = async function(assets, override, url, fetch_options) {
  let buf = await load_to_ArrayBuffer(url, fetch_options)
  let jz = new JSZip()
  let archive = await jz.loadAsync(buf)
  let aliastable = {}
  for (let fname in archive.files) {
    if (fname.endsWith(".mf")) {
      let entry = archive.files[fname]
      let txt = await entry.async("string")
      let strings = txt.split('\n')
      for (let line of strings) {
        line = line.trim()
        if (line.startsWith("#")) {
          continue
        }
        let spp = line.indexOf("#")
        if (spp != -1) {
          line = line.substring(0, spp)
        }
        line = line.trim()
        if (line == "") {
          continue
        }
        let primeparts = line.split('::')
        let token = primeparts[1]
        let parts = primeparts[0].split(':')
        let type = parts[0]
        let alias = parts[1]

        if (type == "mainscene") {
          alias = "MainArea"
        }

        aliastable[token] = alias
      }
    }
  }

  for (let fname in archive.files) {
    let entry = archive.files[fname]
    let name = fname.substring(fname.lastIndexOf('/')+1)
    let i = name.lastIndexOf('.')
    let ext = name.substr(i+1).toLowerCase()
    if (aliastable[name]) {
      name = aliastable[name]
    }
    else {
      name = name.substring(0,i)
    }
    if (assets[name] && !override) {
      continue
    }
    switch(ext) {
      case 'mf':
      case '':
        break
      case 'ekvx': {
        try {
          let ab = await entry.async("arraybuffer")
          assets[name] = new EkvxLoader(ab)
        }
        catch(err) {
          console.log(`ERROR parsing ${fname}: `, err)
        }
      }
      break
      case 'atxt':
      case 'animtxt': {
        txt = await entry.async("string")
        try {
          assets[name] = parse_Animtext(txt)
        }
        catch(err) {
          console.log(`ERROR parsing ${fname}: `, err)
        }
      }
      break
      case 'obj': {
        let txt = await entry.async("string")
        try {
          assets[name] = STDLoader.obj.parse(txt)
        }
        catch(err) {
          console.log(`ERROR parsing ${fname}: `, err)
        }
      }
      break
      case 'png':
      case 'jpg':
      case 'jpeg':
        console.log(`Support for loading '${ext}' files from zip archive has not yet been hacked in!`)
      break
      default:
        console.log(`Unsupported format: '${ext}' (${fname})`)
      break
    }
  }

  for (let fname in aliastable) {
    let name = aliastable[fname]
    if (assets[name] == undefined) {
      console.log(`WARNING:  no data entry loaded for alias '${name}'`)
    }
  }
}

var delay = async function(ms) {
  return new Promise(resolve => {
    //let cb = resolve
    setTimeout(() => {
      resolve();
    }, ms);
  })
}

  // Modulo operation with a forced positive result.
var pos_mod = function(n, mod) {
  let r = n % mod
  return (r >= 0) ? r : r+mod
}

  // Compute the sector containing a given angle.
  //
  //  rad:  An angle specified in radians.
  //  sectors:  Number of sectors (unit circle subdivisions of equal length, with the first starting at angle 0)
var rad_tosector = function( rad, sectors ) {

  // coerce angle to range [0 to 2PI]
  rad %= T
  if (rad < 0) {
    rad += T
  }
  return Math.floor( rad*sectors/T )
}

var debugtip_elem = undefined
var debuglog_elem = undefined
var debug_tip = function(txt) {
  if (!debugtip_elem) {
    console.log(txt)
  }
  else if (txt == undefined) {
    debugtip_elem.innerHTML = "undefined"
  }
  else if (txt == null) {
    debugtip_elem.innerHTML = "null"
  }
  else {
    debugtip_elem.innerHTML = txt
  }
}
var debug_log = function(data) {
  if (!debuglog_elem) {
    console.log(data)
  }
  else if (data == undefined) {
    var node = document.createElement("p");
    node.innerHTML = "undefined"
    debuglog_elem.appendChild(node)
  }
  else if (data == null) {
    var node = document.createElement("p");
    node.innerHTML = "null"
    debuglog_elem.appendChild(node)
  }
  else if (typeof(data) == "string") {
    var node = document.createElement("p");
    node.innerHTML = data
    debuglog_elem.append(node)
  }
  else if (data.className != undefined) {              //DOM element, supposedly
    debuglog_elem.appendChild(data)
  }
  else if (data.jquery && data.length > 0) {

    $(debuglog_elem).append(data)
  }
  else {
    console.log("WARNING:  Whatsthis?:")
    console.log(typeof(data))
    console.log(data)
    window.whatsthis = data
  }
}
  // Code table for converting characters into JS key codes (KeyboardEvent.code)
var keycode = {
  '`':'Backquote', '~':'Backquote',
  '1':'Digit1', '2':'Digit2', '3':'Digit3', '4':'Digit4', '5':'Digit5',
  '6':'Digit6', '7':'Digit7', '8':'Digit8', '9':'Digit9', '0':'Digit0',
  '!':'Digit1', '@':'Digit2', '#':'Digit3', '$':'Digit4', '%':'Digit5',
  '^':'Digit6', '&':'Digit7', '*':'Digit8', '(':'Digit9', ')':'Digit0',
  '-':'Minus', '_':'Minus',
  '=':'Equal', '+':'Equal',
  '[':'BracketLeft', '{':'BracketLeft',
  ']':'BracketRight', '}':'BracketRight',
  '\\':'Backslash', '|':'Backslash',
  ';':'Semicolon', ':':'Semicolon',
  '"':'Quote', '\'':'Quote',
  ',':'Comma', '<':'Comma',
  '.':'Period', '>':'Period',
  '/':'Slash', '?':'Slash',
  ' ':'Space',
}

var initLIBEK = function() {
  for (let i = 65; i < 91; i++) {
    keycode[String.fromCharCode(i)] = 'Key' + String.fromCharCode(i)
    keycode[String.fromCharCode(i+32)] = 'Key' + String.fromCharCode(i)
  }

  debugtip_elem = document.getElementById("debugtip")
  debuglog_elem = document.getElementById("debuglog")

  STDLoader.gif = STDLoader.texture
  STDLoader.png = STDLoader.texture
  STDLoader.jpg = STDLoader.texture
  STDLoader.jpeg = STDLoader.texture

  for (let k in _Material_nametable) {
    _Material_nametable[k.toLowerCase()] = _Material_nametable[k]
  }
}








