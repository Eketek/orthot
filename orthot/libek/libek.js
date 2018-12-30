
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

//  Global resources table
//  Loaded Resources (textures, models, ekvx)
var assets = { }

var libek = {

  _uid:0,
  get UID() {
    libek._uid++
    return libek._uid
  },
  // Display Constructor.
  // Display is defined as a complete render chain.
  // For the time being, this is a renderer, a 3D scene, a camera, and a rendering trigger
  //  Possible additions to consider:  
  //    rendering layers (background / skyboxes, GUI)
  //    subordinate renderers (render to in-scene texture)
  //    rendering callbacks (drawing / rendering deferred to other code/libraries)
  __Display:function disp(renderer, scene, camera) {
    this.renderer = renderer ? renderer : new THREE.WebGLRenderer()
    this.scene = scene ? scene : new THREE.Scene()
    this.camera = camera ? camera : new THREE.PerspectiveCamera( 45, 1, .1, 500 )
    
    this.render = function() {
      this.renderer.render( this.scene, this.camera )
    }
  },

  // Initialize a DOM-resident Display with somewhat OK defaults
  Display:function( elem ) {
    if (elem.dataset.display) {
      return elem.dataset.display
    }
    
    let disp = new libek.__Display()
    //var disp = new libek.Display()
    
    elem.dataset.display = disp
    disp.renderer.setSize( elem.clientWidth, elem.clientHeight )
    disp.camera.aspect = elem.clientWidth / elem.clientHeight
    console.log( disp.camera )
    disp.scene.add(disp.camera)
    disp.camera.updateProjectionMatrix()
    elem.appendChild( disp.renderer.domElement )
    return disp
  },
  
  pick:{      
    // Compute 3D position by picking against a defined picking plane
    planepos:function(disp, pos, plane) {
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
	    return mpos3d
    },
    
  },
  
  AXIS:{ X:1, Y:2, Z:3 },
  
  /*  Get a copy of a loaded asset
      This will either duplicate and return the named asset or fetch and return a pooled instance of it
      
      name:  Name of the asset
      dup:   Either a duplication function [accepting the object to duplicate] or the member name of a [zero-argument] duplication function belonging to the asset
              If false or undefined, this will return the asset without attempting to duplicate it
              
      ALSO:  If any of the object's materials or transformation properties are altered or any such properties on any children, set the obj.__ISDIRTY flag 
              to ensure that it gets cleaned up when released(or clean it up manually)
  */
  getAsset:function(arg, dup="clone") {
    let name
    if (typeof(arg) == "string") {
      name = arg      
    }
    else if (arg.isObject3D) {
      origOBJ = arg
      name = arg.__LIBEK_INST_ASSET_ID
      if (!name) {
        name = "ANON-OBJ-" + libek.UID
        arg.__LIBEK_INST_ASSET_ID = name
        assets[name] = arg
      }
    }
    else {
      console.log("ERROR:  Can not getAsset whatever this is into something useful:", arg)
      return
    }
    let pool = libek._inst_asset_pool[name]
    if (!pool) {
      pool = []
      libek._inst_asset_pool[name] = pool
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
  },
  
  /*  Release an instance of an Asset
      This will store it in the instanced-assets pool
  */
  releaseAsset:function(obj) {
    if (obj.parent) {
      obj.parent.remove(obj)
    }    
    if (obj.__LIBEK_INST_ASSET_ID && (libek._inst_asset_pool[obj.__LIBEK_INST_ASSET_ID].indexOf(obj) == -1) ) {
      if (obj.__ISDIRTY) {
        obj.__ISDIRTY = false
        
        let base = assets[obj.__LIBEK_INST_ASSET_ID]
        libek.cleanAsset(obj, base)
      }
      libek._inst_asset_pool[obj.__LIBEK_INST_ASSET_ID].push(obj)
    }
  },
  
  // reset commonly adjusted properties to the values specified on the base object (and reset properties on children)
  cleanAsset:function(obj, base) {
    obj.matrix = new THREE.Matrix4()
    obj.matrixAutoUpdate = true    
    obj.position.copy(base.position)
    obj.scale.copy(base.scale)
    obj.rotation.copy(base.rotation)
    
    if (obj.material) {
      obj.material = base.material
    }
    for (let i = 0; i < obj.children.length; i++) {
      libek.cleanAsset(obj.children[i], base.children[i])
    }
  },
  
  getChildrenRecursive:function(obj, r=[]) {
    if (obj.__LIBEK_INST_ASSET_ID) {
      r.push(obj)
    }
    else {
      for (let child of obj.children) {
        libek.getChildrenRecursive(child, r)
      }
    }
    return r
  },
  /*  Assign materials to a mesh-type object.
   */
  assignMaterials(mdl, ... materials) {
    materials = libek.util.flatten(materials)
    if (materials) {
      for (let i = 0; i < Math.min(materials.length, mdl.children.length); i++) {
      
        let mat = materials[i]
        if (!mat.isMaterial) {
          mat = libek.Material(mat)
        }
        mdl.children[i].material = mat
      }
    }
  },
  _inst_asset_pool:{},
  
  /*  Generate a Material from a params object.
      
      params:
        type:  Material Constructor or Name of Material to use
                 This defaults to "MeshStandardMaterial" (generates a THREE.MeshStandardMaterial)
        shared:  Whether or not this should be a shared material (If called multiple times with equivalent params, only one instance will be generated)
                 This defaults to true
        *:     The entire params object is passed to the Material Constructor - everything else is Material properties
  */
  Material:function(params) {
    let props
    if (typeof(params) == "string") {
      params = { color:params }
    }
    else if (params.isColor) {
      params = {color:params}
    }
    
    if (!params.type) {
      params.type = libek.DefaultMaterial
    }
    else {
      // If the actual constructor was passed in, backpedal a bit and attempt to find the actual name
      if (typeof(params.type) != "string") {
        for (let k in libek._Material_table) {
          if (params.type == libek._Material_table[k]) {
            params.type = k
          }
        }
      }
      // If an alternate material name is used, change to the actual name
      else if (libek._Material_nametable[params.type]) {
        params.type = libek._Material_nametable[params.type]
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
    
    if (params.shared && libek._sharedmat_store[id]) {
      return libek._sharedmat_store[id]
    }
    
    let Material = params.type
    if (typeof(Material) == "string") {
      Material = libek._Material_table[params.type]
    }
    
    let mat = new Material(params)
    
    if (params.shared) {
      mat.__LIBEK_MATERIAL_ID = id
      libek._sharedmat_store[id] = mat
    }
    mat.__LIBEK_MATERIAL_PARAMS = params
    return mat
  },
  _sharedmat_store:{},
  DefaultMaterial:"MeshStandardMaterial",


  //Used by libek.Material() to map names to Material constructors 
  _Material_table:{
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
  },
  //Used by libek.Material() to 
  _Material_nametable:{    
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
  },
  
  DisposeMaterial:function(mat) {
    if (mat.__LIBEK_MATERIAL_ID) {
      delete libek._sharedmat_store[id]
    }
    mat.dispose()
  },
  
  loader:{
    obj:new THREE.OBJLoader(),
    texture:new THREE.TextureLoader()
  },
  
  loadOBJ:async function(url) {
  
    let cb    
    let p = new Promise( resolve => { cb = resolve })
    
    libek.loader.obj.load(url, obj => { cb(obj) } )
    
    return p    
  },
  
  
  load_to_ArrayBuffer:async function(url) {    
    return new Promise( async resolve => {     
      let resp = await fetch(url)    
      let fr = new FileReader()
      
      fr.readAsArrayBuffer(await resp.blob())
      //console.log(fr)
      
      fr.onloadend = function() {
        resolve(fr.result)
      }
    })
  },
  
  load:async function(url, loader) {
    
    let cb    
    let p = new Promise( resolve => { cb = resolve })
    
    if (!loader) {
      let i = url.lastIndexOf('.')
      if (i != -1) {
        loader = libek.loader[url.substr(i+1)]
      }
    }
    
    if (loader) {    
      loader.load(url, obj => { cb(obj) } )
    }
    else {
      cb()
    }    
    return p    
  },
  
  /* Load any number of resources concurrently, bind them to object properties, and return after all items are loaded.
    
      entries:  List of items to load.  These may be either simple url strings or params objects specifying a url, an optional name, and an optional loader
      
      entry params object:
        url:  A URL string 
        name:  [Optional] A name to bind the loaded resource to - If not specified, loadMuch() will auto-assign one (url string between the last '/' and last '.')
        loader:  [Optional] A function which accepts a URL and passes the result to a callback when it completes - If not specified, libek.load() will select 
                            one based on filename extension
  */
  loadMuch:async function(... entries) {
    entries = libek.util.flatten(entries)
    let plist = new Array(entries.length)
    for (let i = 0; i < entries.length; i++) {
      let entry = entries[i]
      if (typeof(entry) == "string") {
        entries[i] = {url:entry}
        plist[i] = libek.load(entry)
      }
      else {
        plist[i] = libek.load(entry.url, entry.loader)
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
        
        assets[name] = val
      }
    })
  },
  
  loadZIP:async function(url) { 
       
	  let buf = await libek.load_to_ArrayBuffer(url)
	  console.log(buf)
	  let jz = new JSZip()    
    let archive = await jz.loadAsync(buf)
    console.log(archive)
    let aliastable = {}
    for (let fname in archive.files) {
      if (fname.endsWith(".mf")) {
        let entry = archive.files[fname]  
        let txt = await entry.async("string")
        let strings = txt.split('\n')
        for (let line of strings) {
          line = line.trim()
          console.log(line)
          if (line.startsWith("#")) {
            continue
          }
          let spp = line.indexOf("#")          
          if (spp != -1) {
            line = line.substring(0, spp)
          }
          line = line.trim()
          let primeparts = line.split('::')
          let token = primeparts[1]
          let parts = primeparts[0].split(':')
          let type = parts[0]
          let alias = parts[1]
          
          if (type == "mainscene") {
            token = "MainArea"
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
      console.log(name, ext)
      switch(ext) {
        case 'ekvx':
          let ab = await entry.async("arraybuffer")
          try {
            assets[name] = new libek.EkvxLoader(ab)
            if (name == "Key Tutorial") {
              console.log("--------", name, ab, assets[name])
            }
          }
          catch(err) {
            console.log(`ERROR parsing ${fname}: `, err)
          }
        break
        case 'obj':
          let txt = await entry.async("string")
          try {
            assets[name] = libek.loader.obj.parse(txt)
          }
          catch(err) {
            console.log(`ERROR parsing ${fname}: `, err)
          }
        break
        case 'png':   
        case 'jpg':
        case 'jpeg':
          console.log(`Support for loading '${ext}' files from zip archive has not yet been hacked in!`)
        break
        default:
          console.log(`Unsupported format: '${ext}'`)
        break
      }
      
      //if (i != -1) {
      //  loader = libek.loader[url.substr(i+1)]
      //}
      
      //let ab = await entry.async("arraybuffer")
      //if (name.endsWith("ekvx")) {
        
      //}      
      //let ekvx = new libek.EkvxLoader(ab)
    }
    /*
    let ab = await arch.file("ekvxdat/MainArea.ekvx").async("arraybuffer")
    
    let ekvx = new libek.EkvxLoader(ab)

    zone = new orthot.Zone(ekvx)
    console.log(ab, ekvx, zone)
    window.zn = zone
    renderCTL.display.scene.add(zone.scene)*/
  },
  
  delay:async function(ms) {
    return new Promise(resolve => {
      cb = resolve
        setTimeout(() => {
          resolve();
        }, ms);
    }) 
  },
  
  // Modulo operation with a forced positive result.
  pos_mod:function(n, mod) {
    let r = n % mod
    return (r >= 0) ? r : r+mod
  },  
  
  // Compute the sector containing a given angle.
  //
  //  rad:  An angle specified in radians.
  //  sectors:  Number of sectors (unit circle subdivisions of equal length, with the first starting at angle 0)
  rad_tosector:function( rad, sectors ) {
  
    // coerce angle to range [0 to 2PI]
    rad %= T
    if (rad < 0) {
      rad += T
    }
    return Math.floor( rad*sectors/T ) 
  },
  
  debugtip_elem:undefined,
  debuglog_elem:undefined,
  debug_tip:function(txt) {
    if (!libek.debugtip_elem) {
      console.log(txt)
    }
    else if (txt == undefined) {
      libek.debugtip_elem.innerHTML = "undefined" 
    }
    else if (txt == null) {      
      libek.debugtip_elem.innerHTML = "null"
    }
    else {
      libek.debugtip_elem.innerHTML = txt
    }
  },
  debug_log:function(data) {
    if (!libek.debuglog_elem) {
      console.log(data)
    }
    else if (data == undefined) {
      var node = document.createElement("p");
      node.innerHTML = "undefined"       
      libek.debuglog_elem.appendChild(node)
    }
    else if (data == null) {
      var node = document.createElement("p");
      node.innerHTML = "null"       
      libek.debuglog_elem.appendChild(node)
    }
    else if (typeof(data) == "string") {
      var node = document.createElement("p");
      node.innerHTML = data       
      libek.debuglog_elem.append(node)    
    }
    else if (data.className != undefined) {              //DOM element, supposedly
      libek.debuglog_elem.appendChild(data)
    }
    else if (data.jquery && data.length > 0) {     
            
      $(libek.debuglog_elem).append(data)
    }
    else {
      console.log("WARNING:  Whatsthis?:")
      console.log(typeof(data))
      console.log(data)
      window.whatsthis = data
    }
  },  
  
  init:function() {
    for (let i = 65; i < 91; i++) {
      libek.event.keycode[String.fromCharCode(i)] = 'Key' + String.fromCharCode(i)
      libek.event.keycode[String.fromCharCode(i+32)] = 'Key' + String.fromCharCode(i)
    }

    libek.debugtip_elem = document.getElementById("debugtip")
    libek.debuglog_elem = document.getElementById("debuglog")
    
    libek.loader.gif = libek.loader.texture
    libek.loader.png = libek.loader.texture
    libek.loader.jpg = libek.loader.texture
    libek.loader.jpeg = libek.loader.texture
    
    for (let k in libek._Material_nametable) {
      libek._Material_nametable[k.toLowerCase()] = libek._Material_nametable[k]
    }
  }
}








