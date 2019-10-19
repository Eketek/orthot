export { renderCTL, inputCTL, sviewCTL, edCTL }

import { 
  tt, initLIBEK, 
  Display, 
  load, loadMuch, loadZIP, fetchText,
  assignMaterials, getAsset, storeAsset, 
  pickPlanepos, debug_tip 
} from '../libek/libek.js'
import { UVspec, buildVariantMaterial, ManagedColor } from '../libek/shader.js'
import { QueryTriggeredButtonControl, SceneviewController } from '../libek/control.js'
import { clamp, putFloatingElement, centerElementOverElement } from '../libek/util.js'
import { NextEventManager, next, on } from '../libek/nextevent.js'
import { direction } from '../libek/direction.js'
import { BoxTerrain, DECAL_UVTYPE } from '../libek/gen.js'
import { VxScene } from '../libek/scene.js'
// Global rendering properties & controls (Mainly, materials and managed shader properties)
var renderCTL = window.rctl = {
  uv2:new UVspec()
}

//Input controller.  Mouse & keyboard
var inputCTL = window.ictl = {}

// Screen-view controller:  Camera controller which performs orbitting, following, and a bit of flying.
var sviewCTL

var edCTL = window.ectl = {
  tiles:{},
  version:"0.1.0",
  event:new EventTarget(),
  assets:{}
}

$(async function MAIN() {

  initLIBEK()

  let disp_elem = $("#editor").attr("tabindex", "0").get(0)
  disp_elem.addEventListener( 'contextmenu', function(evt) {evt.preventDefault()} )
  disp_elem.focus()
  renderCTL.display = Display(disp_elem, true)
  renderCTL.display.renderer.setClearAlpha(1)
  renderCTL.display.renderer.setClearColor("black")
  

  let TextureProps = {
    magFilter:THREE.NearestFilter,
    anisotropy:4,
  }
  try {
    // Asset management - check assets/verison.txt, compare everything with stored version numbers
    //  If the version is old, use fetch option {cache:"reload"} to force a reload of any old data
    //  Otherwise, use default fetch options
    // While so doing, setup an asynchronous download of everything (and wait for everything to be completed)
    //  Should probably run some sort of display hack and show a progress bar while waiting.
    let dver_file = await fetchText("assets/edversion.txt", {cache:"no-store"})
    let lines = dver_file.split('\n')
    let current_versions = {}
    let prev_versions = {}
    for (let line of lines) {
      line = line.trim()
      if (line != '') {
        let parts = line.split(' ')
        current_versions[parts[0]] = 0|parseInt(parts[1])
      }
    }  
    let reloadOPT = { cache:"reload" }
    
    // accepts a property name and loader function, checks the previous known version against the reported current version,
    //  and if the file is indicated to be old, calls the loader function with a forced reload fetch option
    //  (if not old, the call is made with fetch defaults, so as to accept whatever is cached)
    let update = async function(propname, loadit) {
      let curr_ver = current_versions[propname]
      let prev_ver = 0|parseInt(window.localStorage[propname+"EDVER"])
      let result = await loadit((curr_ver > prev_ver) ? reloadOPT : undefined)
      return result
    }
    
    // call each update, but aggregate all the promises
    let promises = [
      update("texture", (fetchOPTS)=>{
        return loadMuch(
          edCTL.assets,
          fetchOPTS,
          {url:"assets/textures/patterns.png", properties:TextureProps},
          {url:"assets/textures/wall_8bit_fg.png", properties:TextureProps},
        )
      }),
      update("model", (fetchOPTS)=>{
        return loadZIP(edCTL.assets, 'assets/ekvxed2models.zip', fetchOPTS)
      })
    ]
    
    // Whene everything is loaded, update local storage with the versions of the cached files
    await Promise.all(promises)
    console.log("Loaded Ekvxed2 data")
    for (let name in current_versions) {
      window.localStorage[name+"EDVER"] = current_versions[name]
    }
  }
  catch(err) {
    console.log("FAILED to load Ekvxed2 data because:", err)
    return
  }
  /*
  edCTL.tiles.key = {
    source:edCTL.assets.symbols.image,
    x:0, y:0, w:64, h:64
  }
  */
  
  let UI_TILEGRAPHIC_SIZE = [32,32]
  let UI_TILEGRAPHIC_OFFSET = [0, 0]
  let UI_TILESHADOW_SIZE = 8
  let UI_TILESHADOW_OFFSET = [5,3]
  let UI_TILE_SIZE = [37,35]
  
  renderCTL.fg = new ManagedColor("yellow")
  renderCTL.bg1 = new ManagedColor("orange")
  renderCTL.bg2 = new ManagedColor("green")

  renderCTL.vxlMAT = buildVariantMaterial("standard", {
    map:edCTL.assets.wall_8bit_fg,
    bkgtex:edCTL.assets.patterns,
    uv2:renderCTL.uv2,
    roughness:0.76,
    metalness:0.05,
    sample:tt`
      vec4 mc = texture2D( map, vUv );
      vec4 bc = texture2D( bkgtex, uv2 );
      vec3 fgColor = vColor*mc.r + ${renderCTL.fg}*mc.g;
      vec3 bgColor = vColor*bc.r + ${renderCTL.bg1}*bc.g + ${renderCTL.bg2}*bc.b;
      sample = vec4(fgColor * mc.a + bgColor*(1.0-mc.a), 1.0);
    `
  })

  let markmats = [{color:"green", emissive:"green", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]
  let cursormats = [{color:"white", emissive:"white", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]

  assignMaterials(edCTL.assets.CubeMark, markmats)
  assignMaterials(edCTL.assets.FaceMark, markmats)
  assignMaterials(edCTL.assets.CubeCursor, cursormats)
  assignMaterials(edCTL.assets.FaceCursor, cursormats)
  

  let controlActive = false
  sviewCTL = window.sctl = new SceneviewController({
    camtarget:new THREE.Vector3(0,0,0),
    display:renderCTL.display,
    dom_evttarget:disp_elem,
    app_evttarget:edCTL.event,
    pickplane:new THREE.Plane(direction.vector.UP, 0),
    UpdcamUpdatepickplane:true,
    followspeed:1/60,
    campos_maxphi:Math.PI * 0.85,
    onCamUpdate:function() {
      controlActive = true
    },

    OrbitTargetMBTN:"rmb",
    ChaseTargetMBTN:"mmb",

    tpmode_fov:60
  })
  sviewCTL.run()

  let aboutBTN
  let toggleAboutBox = function() {
    $("#about").toggle()
    putFloatingElement($("#about")[0], aboutBTN)
  }
  on($("#hideabout"), "click", toggleAboutBox)
  aboutBTN = $("<div>").addClass("btn_active").text("About").click(toggleAboutBox)[0]
  $("#controls").append(aboutBTN)
  
  
  //-------------------------------------------
  //  Yet another ad-hoc color picker
  //-------------------------------------------
  //  This one can be used to pick an entire pallete (multiple colors to define an object)
  //  This one offers a decent gamut, yet does not ever require more than a single click.
  //  This one provides easilly repeatable selections
  //  This one also works directly on ekvx Tools.
  //  This one is also very short and simple (under 200 lines of code)
  //  And if that's not enough, this one [arguably unnecessarilly] also allows User to configure the palette generator
  let primaryBTN
  let mainBTNS = []  
  let colorBTN = function(params) {
    let $elem = $('<div class="noselect">')
    let $loc = $("#" + params.loc)
    this.color = params.color
    $elem.appendTo($loc)
    
    let elem = $elem[0]
    elem.style["background-color"] = params.color
    elem.style["border-color"] = "lightgray"
    elem.style["border-style"] = "solid"
    
    on(elem, "mouseover", ()=>{
      elem.style["border-color"] = "black"
    })
    on(elem, "mouseout", ()=>{
      elem.style["border-color"] = "lightgray"
    })
    
    let resize = function(w,h) {
      if (h == undefined) {
        h = w
      }
      elem.style["min-width"] = w
      elem.style["max-width"] = w
      elem.style["min-height"] = h
      elem.style["max-height"] = h
    }
    
    let sz
    if (params.small) {
      if (params.emphasize) {
        resize(9,18)
      }
      else {
        resize(9,9)
      }
      elem.style["border-width"] = 1
      elem.style["margin"] = 0
    }
    else {
      resize(18)
      elem.style["border-width"] = 2
      elem.style["margin"] = 2
    }
    
    this.remove = function() {
      $(elem).remove()
    }
      
    // If a "main" button, this button controller is used to transfer picked colors to the active Tool color table.
    if (params.main) {
      this.unsetPrimary = function() {
        resize(18)
      }
      this.setPrimary = (function() {
        if (primaryBTN) {
          primaryBTN.unsetPrimary()
        }    
        resize(24)
        primaryBTN = this
      }).bind(this)
      this.unsetPrimary()
      
      let idx = mainBTNS.length
      mainBTNS.push(this)
      on(elem, "click", this.setPrimary)
      
      
      this.setColor = function(col) {
        elem.style["background-color"] = col
        activeTool.colors[idx] = col      // activeTool.colors and mainBTNS are parallel
        this.color = col
        onColorsSelected()
      }
    }
    //If not a "main" button, the button is used to pick the color of the primary button
    else {
      let _color
      Object.defineProperty(this, 'color', {
        set:function(col) { 
          _color = col
          elem.style["background-color"] = col
        },
        get:function() {
          return _color
        }
      })
      this.color = params.color
      if (params.setRecent) {
        on(elem, "click", ()=>{
          if (primaryBTN) {
            primaryBTN.setColor(this.color)
            nextRecentColor(this.color)
          }
        })
      }
      else {
        on(elem, "click", ()=>{
          if (primaryBTN) {
            primaryBTN.setColor(this.color)
          }
        })
      }
    }
  }
  
  let recentColorBTNS = []
  for (let i = 0; i < 21; i++) {
    let btn = new colorBTN({ loc:"recentColors", color:"white" })
    recentColorBTNS.push(btn)
  }
  
  let nextRecentColor = function(col) {
    for (let i = recentColorBTNS.length-1; i >= 1; i--) {
      let j = i - 1
      recentColorBTNS[i].color = recentColorBTNS[j].color
    }
    recentColorBTNS[0].color = col
  }
  
  let _col = new THREE.Color()
  let numHues = 18
  
  let paletteBTNS = []
  
  let loadPalette = function() {
    for (let btn of paletteBTNS) {
      btn.remove()
    }
    paletteBTNS = []
    let sats, lights, numHues
    try {
      sats = extractNums($("#satsTA")[0].value)
    }
    catch {}
    if (!sats || (sats.length == 0)) {
      sats = [1, 0.6, 0.3, 0.1]
    }
    try {
      lights = extractNums($("#lightsTA")[0].value)
    }
    catch {}
    if (!lights || (lights.length == 0)) {
      lights = [0.85, 0.7, 0.5, 0.25, 0.1]
    }
    
    //build buttons for each color, but [for sanity] do not exceed 1800 buttons generated
    let count = 0
    
    numHues = clamp(Number.parseFloat($("#numHuesTA")[0].value), 0, 360)
    for (let l = 0; l < numHues; l++) {      
      _col.setHSL(0, 0, l/(numHues-1))
      paletteBTNS.push(new colorBTN({ loc:"palleteColors", color:_col.getStyle(), small:true }))
      count++
      if (count > 1800) {
        return
      }
    }
    // Why go through the trouble of inserting a big color picker, when I can just do this?:
    for (let s of sats) {
      for (let l of lights) {
        for (let h = 0; h < numHues; h ++) {
          _col.setHSL(h/numHues, s, l)
          paletteBTNS.push(new colorBTN({ loc:"palleteColors", color:_col.getStyle(), small:true, setRecent:true, emphasize:(l==0.5) }))
          count++
          if (count > 1800) {
            return
          }
        }
      }
    }
  }
  loadPalette()
  
  on($("#numHuesTA"), "input", loadPalette)
  on($("#satsTA"), "input", loadPalette)
  on($("#lightsTA"), "input", loadPalette)
  
  on($("#resetHSLcfgBTN"), "click", ()=>{
    $("#numHuesTA")[0].value = "18"
    $("#satsTA")[0].value = "100 60 30 10"
    $("#lightsTA")[0].value = "85 70 50 25 10"
    loadPalette()
  })
  
  
  let extractNums = function(val) {
    let parts = val.split(' ')
    let r = []
    for (let part of parts) {
      r.push(clamp(Number.parseFloat(part)/100, 0,1))
    }
    return r
  }
  
  
  let onColorsSelected = function() {
  // Color the border of the color selector with all of the colors selected.
    let cssStr = "repeating-linear-gradient(45deg"
    for (let i = 0; i < mainBTNS.length; i++) {
      cssStr += ","
      cssStr += mainBTNS[i].color
      cssStr += ","
      cssStr += mainBTNS[i].color
      cssStr += ","
      cssStr += mainBTNS[i].color
      cssStr += ","
      cssStr += mainBTNS[i].color
    }
    cssStr += " " + mainBTNS.length*5 + "px) 1 / 1 / 0"
    $("#colorOutline")[0].style["border-image"] = cssStr
  }
  
  let btnA = new colorBTN({ loc:"objColors", color:"black", main:true })
  let btnB = new colorBTN({ loc:"objColors", color:"red", main:true })
  let btnC = new colorBTN({ loc:"objColors", color:"green", main:true })
  let btnD = new colorBTN({ loc:"objColors", color:"blue", main:true })
  
  btnB.setPrimary()
  onColorsSelected()
  
  
  
  let bxtbldr = new BoxTerrain(renderCTL.vxlMAT, renderCTL.uv2)
  let vxc = new VxScene({
    boxterrain:bxtbldr,
    chunks_per_tick:4
  })
  
  var amblCol = new THREE.Color("white")
  amblCol.setHSL ( 0.125, 1, 0.5 )
  var vambl = new THREE.AmbientLight(amblCol, 0.125)
  var ambl = new THREE.AmbientLight(0xffffff, 0.125)
  vxc.scene.add(ambl)
  vxc.scene.add(vambl)
  let dlight = new THREE.DirectionalLight( 0xffffff, 1 )
  dlight.position.set(300,1000,700)
  vxc.scene.add(dlight)
  
  renderCTL.display.scene.add(vxc.scene)
  
  let put = function(obj, x,y,z, ld=false) {
    if (obj.terrain) {
      if (ld) {
        vxc.loadTerrain(x,y,z, obj.terrain)
      }
      else {
        vxc.setTerrain(x,y,z, obj.terrain)
      }
      return
    }
    let ctn = vxc.get(obj.x,obj.y,obj.z)
    if (ctn.contents) {
      let idx = ctn.contents.indexOf(obj)
      if (idx != -1) {
        ctn.contents.splice(idx,1)
      }
    }
    obj.x = x
    obj.y = y
    obj.z = z
    ctn = vxc.get(x,y,z)
    if (!ctn.contents) {
      ctn.contents = []
      ctn.contents.push(obj)
    }
    if (obj.mdl) {
      if (!obj.mdl.parent) {
        vxc.scene.add(obj.mdl)
      }
      obj.mdl.position.set(x,y,z)
    }
  }
  
  let remove = function(obj) {
    if (obj.terrain) {
      vxc.setTerrain(x,y,z, 0)
      return
    }
    let ctn = vxc.get(obj.x,obj.y,obj.z)
    if (ctn.contents) {
      let idx = ctn.contents.indexOf(obj)
      if (idx != -1) {
        ctn.contents.splice(idx,1)
      }
    }
    if (obj.mdl) {
      if (obj.mdl.parent) {
        obj.mdl.parent.remove(obj)
      }
    }
  }
  
  let cursor3d = {
    x:0,y:0,z:0,
    isDecorative:true,
    mdl:new THREE.Object3D()
  }
  let cubeCursor = getAsset(edCTL.assets, "CubeCursor")
  cursor3d.mdl.add(cubeCursor)
  put(cursor3d,0,0,0)
  
  {(async function Cursor3DControl () {
    let evtman = new NextEventManager()
    
    while (true) {
      let evt = await evtman.next("mousemove")
      let mp3d = sviewCTL.mpos3d
      
      //point
      edCTL.event.dispatchEvent( new Event("mousemove_point"))
        
      let x = Math.round(mp3d.x)
      let y = Math.round(mp3d.y)
      let z = Math.round(mp3d.z)
      
      //cube
      if ( (x != cursor3d.x) | (x != cursor3d.x) | (x != cursor3d.x)) {
        put(cursor3d, x,y,z)
        controlActive = true
        edCTL.event.dispatchEvent(new Event("mousemove_cube"))
      }
      
      //face + alignment
    }
  })()}
  
  let build = function() {
    console.log(cursor3d)
  }
  
  let opSpecs = {
    buildcube: { click:build, drag:build, drag_evttype:"mousemove_cube" }
  }
  
  let handleInput = async function(opspec) {
    let evtman = new NextEventManager()
    outer:
    while (true) {
      let evt = await evtman.next(disp_elem, "mousedown", edCTL.event, "cancel")
      if (evt.type == "cancel") {
        return
      }
      if (opspec.click) { opspec.click() }
      if (opspec.drag_evttype) {
        inner:
        while (true) {
          evt = await evtman.next(disp_elem, "mouseup", edCTL.event, opspec.drag_evttype, "cancel")
          switch(evt.type) {
            case "cancel":
              if (opspec.cancel) { opspec.cancel() }
              return
            case "mouseup":
              if (opspec.release) { opspec.release() }
              break inner
            case opspec.drag_evttype:
              if (opspec.drag) { opspec.drag() }
              break
          }
        }
      }
    }
  }
  
  let tools = {}
  let defineTool = function(spec) {
    //wrap the spec
    let tool = {
      spec:spec,
      colors:[]
    }
    
    // build the default preset for the tool
    if (spec.color) {
      if (spec.color.default) {
        if (Array.isArray(spec.color.default)) {
          for ( let i = 0; i < spec.color.amount; i++ ) {
            tool.colors.push(spec.color.default[i])
          }
        }
        else {
          for ( let i = 0; i < spec.color.amount; i++ ) {
            tool.colors.push(spec.color.default)
          }
        }
      }
      else {
        for ( let i = 0; i < spec.color.amount; i++ ) {
          tool.colors.push("white")
        }
      }
    }
    
    //store the tool
    tools[spec.name] = tool
  }
  
  let activeTool
  let setTool = function(name) {
    edCTL.event.dispatchEvent(new Event("cancel"))
    activeTool = tools[name]
    let opspec = opSpecs[activeTool.spec.routine]
    handleInput(opspec)
    primaryBTN = undefined
    for (let mbtn of mainBTNS) {
      mbtn.remove()
    }
    mainBTNS = []
    if (activeTool.spec.color) {
      for (let col of activeTool.colors) {
        let mbtn = new colorBTN({ loc:"objColors", color:col, main:true })
      }
      if (activeTool.spec.color.mainIndex != undefined) {
        mainBTNS[activeTool.spec.color.mainIndex].setPrimary()
      }
    }
    onColorsSelected()
  }
  
  let templateID = 1
  let templateIDs = {}
  let templateData = {}
  let getTemplateID = function(data) {
    let str_data = JSON.stringify(data)
    let id = templateIDs[str_data]
    if (id == undefined) {
      id = templateID
      templateID++
      templateIDs[str_data] = id
      templateData[id] = data
    }
    return id
  }
  
  let getTemplate = function(id) {
    return templateData[id]
  }
  
  defineTool({
    type:"wall",                            // object type indicator
    name:"Wall",                            // Name for reference and display in-editor
    pickMode:"cube",                        // Pick unaligned unit cubes with integer coordinates
    spatialClass:"solid",                   // Tag used in-editor for picking and coexistance checks (not intended to be data)
    spclassPick:["solid"],                  // allow picking against objects of these classes
    spclassCoexist:[],                      // Objects that the defined object may coexist with
    planarPick:true,                        // allow picking against XY, XZ, and YZ planes
    routine:"buildcube",                    // Input handler to run while tool is active
    template:["type", "color", "uvscpec"],  // Put these properties in the template
    color:{                                 // Colorable object declaration
      amount:1,                             // Number of [defined] colors 
      default:["white"],                    // default for each defined color
      mutable:[true],                       // indicate which defined colors may be selected by User
      mainIndex:0,                          // "shorthand" color picking assigns to this entry in the color table
    },  
    terrain:{                               // defines the UVs to use for rendering terain (blocks of entries in a texture atlas)
      primary:{                             // Primary texture coordinate definition
        all:{                               // all -- use the same component for all sides
          eightbit:true,                    // use the "8 bit" texture coordinate generator (use contiguity with 8 neighboring tiles to select tile UVs)
          layout:"grid",                    // declare a standard "grid" layout for texture coordinates
          gridWidth:1,                      // Clarify aforementioned grid layout as being 1x1
          gridHeight:1,                     //    ''
          block:0,                          // Use the first block [from the grid layout]
        }
      },
      decal:{                               // Secondary texture coordinate definition
        all:{                               // all -- use the same component for all sides
          tile:true,                        // single-tile decal
          layout:"tiles",                   // A grid of tiles with no assumed relationships
          width:8,                          // Clarify the tile-grid as being 8x8 
          height:8,                         //    ''
          pickrand_init:true,               // Pick a random tile during initilization and use it for all surfaces of the same class
          randmin:0,                        //  random selection minimum
          randmax:6,                        //  random selection maximum
        }
      }
    },
    params:{},                              // arbitrary properties to add to all templates
    lockedParams:{}                         // immutable arbitrary properties to add to all templates
  })
  setTool("Wall")
  
  
  // BoxTerrain configuration section
  // Purpose of this is to expose the internal features of BoxTerrain (multiple sets of boundary graphics from a texture atlas, arbitrary decals from a second 
  // texture atlas, and unique configurations for each of the 6 directions)
  
  let ddefs = {}
  let toDecalParams = function(decalSpec) {
    let k = JSON.stringify(decalSpec)
    if (ddefs[k]) {
      return _ddefs[k]
    }
    let ddef
    if (decalSpec.tile) {
      ddef = {
        type:DECAL_UVTYPE.TILE, 
      }
      if (decalSpec.pickrand_init) {
        ddef.lut = { entry:Math.floor(Math.random()*(decalSpec.randmax-decalSpec.randmin))+decalSpec.randmin }
      }
      else {
        ddef.lut = {entry:decalSpec.value|0}
      }
      ddef.lut.num_rows = decalSpec.width,
      ddef.lut.num_cols = decalSpec.height
    }
    ddefs[k] = ddef
    return ddef
  }
  
  // attach the specified "block" bounds to a params object (parameters for gen.build_texcoordLUT)
  let apply8bitTerrspec = function(params, terrspec) {
    let left = (terrspec.block % terrspec.gridWidth) / terrspec.gridWidth
    let right = left + 1/terrspec.gridWidth
    let top = Math.floor(terrspec.block / terrspec.gridWidth) / terrspec.gridHeight
    let bottom = top + 1/terrspec.gridHeight
    params.num_rows = 16 * terrspec.gridHeight,
    params.num_cols = 16 * terrspec.gridWidth,
    params.texcoord_ul = {x:left, y:top},
    params.texcoord_br = {x:right, y:bottom}
  }
  
  //let surfaceDefs = {}
  let bxtsfcdefiners = {}
  let next_terrainid = 1
  let next_sfcid = 1
  let terrainIDs = {}
  let defineTerrain = function(name, sfcdef) {
    //surfaceDefs[name] = sfcdef
    
    // Set up the "decal" specifications for all directions
    //  (the decal specifciation is the secondary texture coordinates for 
    let nd, ed, sd, wd, ud, dd
    if (sfcdef.decal.all) {
      nd = ed = sd = wd = ud = dd = toDecalParams(sfcdef.decal.all)
    }
    if (sfcdef.decal.h) {
      ud = dd = toDecalParams(sfcdef.decal.h)
    }
    if (sfcdef.decal.v) {
      nd = ed = sd = wd = toDecalParams(sfcdef.decal.v)
    }
    if (sfcdef.decal.n) {
      nd = toDecalParams(sfcdef.decal.n)
    }
    if (sfcdef.decal.e) {
      ed = toDecalParams(sfcdef.decal.e)
    }
    if (sfcdef.decal.s) {
      sd = toDecalParams(sfcdef.decal.s)
    }
    if (sfcdef.decal.w) {
      wd = toDecalParams(sfcdef.decal.w)
    }
    if (sfcdef.decal.u) {
      ud = toDecalParams(sfcdef.decal.u)
    }
    if (sfcdef.decal.d) {
      dd = toDecalParams(sfcdef.decal.d)
    }
    
    let ddefs = [nd, ed, sd, wd, ud, dd]
    
    let facedefs = [{}, {}, {}, {}, {}, {}]
    
    for (let i = 0; i < 6; i++) {
      Object.assign(facedefs[i], ddefs[i])
    }
    
    if (sfcdef.primary.all) {
      apply8bitTerrspec(facedefs[0], sfcdef.primary.all)
      apply8bitTerrspec(facedefs[1], sfcdef.primary.all)
      apply8bitTerrspec(facedefs[2], sfcdef.primary.all)
      apply8bitTerrspec(facedefs[3], sfcdef.primary.all)
      apply8bitTerrspec(facedefs[4], sfcdef.primary.all)
      apply8bitTerrspec(facedefs[5], sfcdef.primary.all)
    }
    if (sfcdef.primary.v) {
      apply8bitTerrspec(facedefs[0], sfcdef.primary.v)
      apply8bitTerrspec(facedefs[1], sfcdef.primary.v)
      apply8bitTerrspec(sfcdefs[2], sfcdef.primary.v)
      apply8bitTerrspec(facedefs[3], sfcdef.primary.v)
    }
    if (sfcdef.primary.h) {
      apply8bitTerrspec(facedefs[4], sfcdef.primary.h)
      apply8bitTerrspec(facedefs[5], sfcdef.primary.h)
    }
    if (sfcdef.primary.n) {
      apply8bitTerrspec(facedefs[0], sfcdef.primary.n)
    }
    if (sfcdef.primary.e) {
      apply8bitTerrspec(facedefs[1], sfcdef.primary.e)
    }
    if (sfcdef.primary.s) {
      apply8bitTerrspec(facedefs[2], sfcdef.primary.s)
    }
    if (sfcdef.primary.w) {
      apply8bitTerrspec(facedefs[3], sfcdef.primary.w)
    }
    if (sfcdef.primary.u) {
      apply8bitTerrspec(facedefs[4], sfcdef.primary.u)
    }
    if (sfcdef.primary.d) {
      apply8bitTerrspec(facedefs[5], sfcdef.primary.d)
    }
    
    let baseK = JSON.stringify(sfcdef)+"|"
    
    console.log(facedefs)
    
    bxtsfcdefiners[name] = function config_bxt(colors) {
      let k = baseK + colors.join(" ")
      if (terrainIDs[k]) {
        return terrainIDs[k]
      }
      //Configure the box terrain for each surface [with the corresponding  input color]
      //    (maybe think about preparing only one surface for each unique color-decaldef pair - present approach is just to not care about that...)
      let sfcdefids = []
      for (let i = 0; i < 6; i++) {
        let fdef = facedefs[i]
        bxtbldr.defineSurface_8bit(next_sfcid, {
          color:colors[i],
          uv2info:fdef
        })
        sfcdefids[i] = next_sfcid
        next_sfcid++
      }
      let tid = bxtbldr.defineTerrain.apply(bxtbldr, sfcdefids)
      terrainIDs[k] = tid
      return tid
      //bxtbldr.defineTerrain(id, id,id,id,id,id+'H',id+'H')
    }
    
    /*  
    let defineWallTerrain = function(id, color) {
      bxtbldr.defineSurface_8bit(id, {
        color:color,
        uv2info:{type:DECAL_UVTYPE.TILE, scale:33, lut:{num_rows:8, num_cols:8, entry:Math.floor(Math.random()*4)+32 }}
      })
      bxtbldr.defineSurface_8bit(id+'H', {
        color:color,
        uv2info:{type:DECAL_UVTYPE.TILE, scale:33, lut:{num_rows:8, num_cols:8, entry:Math.floor(Math.random()*5)}}
      })
      bxtbldr.defineTerrain(id, id,id,id,id,id+'H',id+'H')
    }
    */
  }
  
  defineTerrain("asdf", {
    primary:{
      all:{                               // Primary texture coordinate definition:
        eightbit:true,                    // use the "8 bit" texture coordinate generator (use contiguity with 8 neighboring tiles to select tile UVs)
        layout:"grid",                    // declare a standard "grid" layout for texture coordinates
        gridWidth:1,                      // Clarify aforementioned grid layout as being 1x1
        gridHeight:1,                     //    ''
        block:0,                          // Use the first block [from the grid layout]
      },
    },
    decal:{
      all:{                               // Secondary texture coordinate definition for all cube surfaces (U, D, N, E, S, and W)
        tile:true,                        // Pick a tile
        layout:"tiles",                   // A grid of tiles with no assumed relationships
        width:8,                          // Clarify the tile-grid as being 8x8 
        height:8,                         //    ''
        pickrand_init:true,               // Pick a random tile during initilization and use it for all surfaces of the same class
        randmin:0,                        //  random selection minimum
        randmax:6,                        //  random selection maximum
      }
    }
  })
  
  // Item description display
  // These functions (orthot.showDescription and orthot.updateDescription and orthot.hideDescription) are used to allow items to show tooltips and run graphical
  // visualizarion routines.  These are called as objects or interface-elements are moused-over and moused-out
  /*
  let shownItem
  let tiptext = ""
  edCTL.showDescription = function(item) {
    if (shownItem && shownItem != item) {
      edCTL.hideDescription(shownItem)
    }
    shownItem = item
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
      controlActive = true
    }
  }
  edCTL.updateDescription = function(item) {
    if (item != shownItem) {
      return
    }
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
      controlActive = true
    }
  }

  edCTL.hideDescription = function(item) {
    if (item != shownItem) {
      return
    }
    shownItem = null
    tiptext = ""
    if (item.visualizer) {
      item.visualizer(false)
      controlActive = true
    }
  }
  */


  var run = function run () {
    requestAnimationFrame( run );
    edCTL.event.dispatchEvent(new Event("frame"))
    
    if (controlActive) {
      controlActive = false
      renderCTL.display.render()
    }
    
    //let mpos3d = pickPlanepos(renderCTL.display, evtman.mpos, sviewCTL.pickplane)
    //debug_tip(`${tiptext}<br>
    //Mouse position:  x=${mpos3d.x}, y=${mpos3d.y}, z=${mpos3d.z}`)
  }
  run()
})





















