export { renderCTL, inputCTL, sviewCTL, edCTL }

import { 
  tt, initLIBEK, 
  Display, 
  load, loadMuch, loadZIP, fetchText,
  assignMaterials, getAsset, storeAsset, 
  pickAgainstPlane, debug_tip 
} from '../libek/libek.js'
import { UVspec, buildVariantMaterial, ManagedColor } from '../libek/shader.js'
import { QueryTriggeredButtonControl, SceneviewController } from '../libek/control.js'
import { anythingIN, clamp, putFloatingElement, centerElementOverElement } from '../libek/util.js'
import { NextEventManager, next, on } from '../libek/nextevent.js'
import { direction } from '../libek/direction.js'
import { BoxTerrain, DECAL_UVTYPE } from '../libek/gen.js'
import { VxScene } from '../libek/scene.js'
import { plotLine, debugLine } from '../libek/plot.js'

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
          {url:"assets/textures/editoricons.png", properties:TextureProps},
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
  
  let pickplane = new THREE.Plane(direction.vector.UP.clone(), 0)
  
  let controlActive = false
  sviewCTL = window.sctl = new SceneviewController({
    camtarget:new THREE.Vector3(0,0,0),
    display:renderCTL.display,
    dom_evttarget:disp_elem,
    app_evttarget:edCTL.event,
    pickplane:pickplane,
    UpdcamUpdatepickplane:true,
    followspeed:1/60,
    campos_maxphi:Math.PI * 0.85,
    onCamUpdate:function() {
      controlActive = true
    },

    OrbitTargetMBTN:"rmb",
    ChaseTargetMBTN:"mmb",

    tpmode_fov:60,
    PickPlane_ArrowkeyController:"wasd arrows",
    subunit:1,
  })
  sviewCTL.run()
  
  // mrayDragOBJs is used by mouse-ray pickmode controller to avoid picking against objects placed during the current click & drag operation
  // The list is initalized when LMB is pressed and reset when LMB is released or if click & drag is cancelled
  //  (This makes click & drag useful for building things more interesting than a chain of blocks pointing directly at the camera)
  let mrayDragOBJs
  //Maximum amount of objects to avoid picking against (if limit is reached, it starts removing the holdest objects in the list)
  let MrayDragLimit = 4
  
  let PICKRAY_LENGTH = 50
  let recentPos = new THREE.Vector3(0,0,0)
  let pickmode = "xz"
  
  
  //Editor-icon PNG:  ectl.assets.editoricons.image 
  //  (loaded through the THREE.js texture loader.  For this purpose, this is equivalent to linking to it with an <img> element)
  
  //  Editor icons are tilesheets.  
  //  There is a general-purpose tilesheet for tools & options which are intended as common (pick mode, copy, paste, move, delete, edit-properties, etc.)
  //  There is a second application-specific tilesheet for the data to operate on (to be provided through a configurer).
  //  Each tile is 48x22 pixels in size.
  //  Each icon has a specific row & column position (in addition to something that indicates whether it is from the general sheet or the application sheet).
  //  These icons are [intended as] a graphics-only representation of the tool.
  
  //  These icons are also to be supplemented with a short/acyonym text representation of the tool to be drawn underneath the icon
  //  The short text should be augmented with a descriptive tooltip 
  //  At some point, these texts should also become localized texts

  //  Background highlighting is to indicate the following UI statuses:
  //    Inactive  (tool not in use)
  //    Active    (tool currently in use)
  //    Inactive + Mouseover
  //    Active + Mouseover
  //    Activating (Active + Mousedown)

  let deactivators = {}

  let addEditorBTN = edCTL.addEditorBTN = function(name, desc, value, init_active, position, activeClass, sheet, row, col, hue, hdev) {
    let $btn = $("<canvas>")
    let cnv = $btn[0]
    cnv.title = desc
    $("#"+position).append($btn)
    cnv.width = 52
    cnv.height = 52
    let ctx = cnv.getContext('2d')
    let active = false
    let hover = false
    let activating = false
    
    ctx.font = "18px serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    
    ctx.fillStyle = "white"
    ctx.strokeStyle = "black"
    ctx.lineWidth = 2
    ctx.fillRect(0,0,52,52)
    ctx.strokeRect(2,2,49,49)
    
    let src = edCTL.assets[sheet].image
    //if (sheet == "general") {
    //  src = ectl.assets.editoricons.image
    //}
    //else {
      //src = ectl.assets.appicons.image
    //}
    
    let draw = function() {
      if (activating) {
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`
      }
      else if (active && hover) {
        ctx.fillStyle = `hsl(${hue+hdev}, 100%, 50%)`
      }
      else if (active && !hover) {
        ctx.fillStyle = `hsl(${hue+hdev*2}, 100%, 50%)`
      }
      else if (!active && hover) {
        ctx.fillStyle = `hsl(${hue+hdev*3}, 100%, 50%)`
      }
      else if (!active && !hover) {
        ctx.fillStyle = "white"
      }
      ctx.fillRect(6,10,40,16)
      ctx.drawImage(src, col*48, row*22, 48, 22, 2,6,48,22)
      ctx.fillStyle = "black"
      ctx.fillText(name, 26, 34, 48)
    }
    
    let deactivate = function() {
      active = false
      draw()
    }
    
    if (init_active) {
      active = true
      deactivators[activeClass] = deactivate
    }
    draw()
    
    on($btn, "mousedown", ()=> {
      if (deactivators[activeClass]) {
        deactivators[activeClass]()
      }
      activating = true
      active = true
      deactivators[activeClass] = deactivate
      draw()
      if (typeof(value) == "function") {
        value()
      }
      else if (typeof(value) == "string") {
        // set active tool
        setTool(value)
      }
    })
    on($btn, "mouseup", ()=> {
      activating = false
      draw()
    })
    on($btn, "mouseenter", ()=> {
      hover = true
      draw()
    })
    on($btn, "mouseleave", ()=> {
      hover = false
      draw()
    })
    return $btn
  }
  let setMraypickmode = function() {
    pickmode = "mray"
  }
  let setXZpickmode = function() {
    pickmode = "xz"
    pickplane.setFromNormalAndCoplanarPoint(direction.vector.UP, recentPos)
    pickplane.constant *= -1
  }
  let setXYpickmode = function() {
    pickmode = "xy"
    pickplane.setFromNormalAndCoplanarPoint(direction.vector.NORTH, recentPos)
    pickplane.constant *= -1
  }
  let setYZpickmode = function() {
    pickmode = "yz"
    pickplane.setFromNormalAndCoplanarPoint(direction.vector.WEST, recentPos)
    pickplane.constant *= -1
  }
  
  addEditorBTN("MRAY", "Pick against object under mouse cursor", setMraypickmode, false, "options", "pickmode", "editoricons", 0, 0, 40, 5)
  addEditorBTN("XZ", "Pick against an XZ plane", setXZpickmode, true, "options", "pickmode", "editoricons", 0, 1, 40, 5)
  addEditorBTN("XY", "Pick against an XY plane", setXYpickmode, false, "options", "pickmode", "editoricons", 0, 2, 40, 5)
  addEditorBTN("YZ", "Pick against an YZ plane", setYZpickmode, false, "options", "pickmode", "editoricons", 0, 3, 40, 5)

  on($("#foldcommandsBTN"), "click", ()=>{ $("#commands").toggle()})
  on($("#foldtoolsBTN"), "click", ()=>{ $("#tools").toggle()})
  on($("#foldoptionsBTN"), "click", ()=>{ $("#options").toggle()})
  
  let aboutBTN
  let toggleAboutBox = function() {
    $("#about").toggle()
    putFloatingElement($("#about")[0], aboutBTN)
  }
  on($("#hideabout"), "click", toggleAboutBox)
  aboutBTN = $("<div>").addClass("btn_active").text("About").click(toggleAboutBox)[0]
  $("#controls").append(aboutBTN)
  
  let portuiBTN
  let portuiVisible = false
  let togglePortUI = function() {
    if (portuiVisible) {
      $("#port").hide()
      portuiVisible = false
    }
    else {
      $("#port").show()
      putFloatingElement($("#port")[0], portuiBTN)
      $("#exportTarget")[0].value = serialize()
      portuiVisible = true
    }
  }
  portuiBTN = $("<div>").addClass("btn_active").text("Export/Import").click(togglePortUI)[0]
  $("#controls").append(portuiBTN)
  
  on($("#foldrecentBTN"), "click", ()=>{ $("#recentColors").toggle()})
  on($("#foldpalettecfgBTN"), "click", ()=>{ $("#palettecfg").toggle()})
  on($("#foldpaletteBTN"), "click", ()=>{ $("#palleteColors").toggle()})
  
  let pixCNV = $("<canvas>")[0]
  pixCNV.width = 1
  pixCNV.height = 1
  let pixCTX = pixCNV.getContext('2d')
  
  // Convery a color string to a standardized format ...
  //  by drawing it onto a hidden canvas, then reading the resulting pixel value...
  let toRGBstring = function(col) {
    pixCTX.fillStyle = col
    pixCTX.fillRect(0,0,1,1)
    let imgd = pixCTX.getImageData(0,0,1,1)
    return `rgb(${imgd.data[0]},${imgd.data[1]},${imgd.data[2]})`
  }
  
  let activeTool
   
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
    let $elem = $('<span class="noselect">')
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
        updateColors()
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
      paletteBTNS.push(new colorBTN({ loc:"palleteColors", color:_col.getStyle(), small:true, setRecent:true }))
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
          paletteBTNS.push(new colorBTN({ loc:"palleteColors", color:_col.getStyle(), small:true, setRecent:true, emphasize:((numHues==18) && (l==0.5)) }))
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
  
  let updateColors = function() {
    if (activeTool) {
      if (activeTool.spec.terrain) {
        activeTool.terrainID = bxtsfcdefiners[activeTool.spec.terrain.name](activeTool.colors)
      }
      else if (activeTool.mesh) {
        // use a soon-to-be material generator to update mesh materials
      }
    }
    
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
  updateColors()
  
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
    }
    ctn.contents.push(obj)
    if (obj.terrainID) {
      console.log(obj)
      if (ld) {
        vxc.loadTerrain(x,y,z, obj.terrainID)
      }
      else {
        vxc.setTerrain(x,y,z, obj.terrainID)
      }
      return
    }
    else if (obj.mdl) {
      if (!obj.mdl.parent) {
        vxc.scene.add(obj.mdl)
      }
      obj.mdl.position.set(x,y,z)
    }
    
  }
  
  let remove = function(obj) {
    if (obj.terrainID) {
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
    let idx = data.objects.indexOf(obj)
    if (idx != -1) {
      data.objects.splice(idx, 1)
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
  
  let draw_debugline = false
  let debug_obj
  {(async function Cursor3DControl () {
    let evtman = new NextEventManager()
    
    while (true) {
      let evt = await evtman.next(disp_elem, "mousemove", document, ".wasd arrows")
      //console.log(evt)
      let mp3d, up, forward
      
      switch(pickmode) {
        case "xz":
        case "xy":
        case "yz":
          mp3d = sviewCTL.mpos3d
          break
        case "mray": {
          let mray = sviewCTL.mray
          let origin = mray.origin.clone()
          let ray_end = mray.direction.clone()
          ray_end.multiplyScalar(PICKRAY_LENGTH)
          ray_end.add(origin)
          origin.x += 0.5
          origin.z += 0.5
          ray_end.x += 0.5
          ray_end.z += 0.5
          
          let plot = function(coord) {
            //check the spatial class of each object at each plotted position against the ActiveTool spatial-class-pick list.
            //  If a match is found, then pick either the position of the object or the immediately adjacent position [along the picked face up vector]
            //  and cancel the plotting operation.
            let ctn = vxc.get(coord.x, coord.y, coord.z)
            let spclasses = activeTool.spec.spclassPick
            if (ctn.contents) {
              for (let obj of ctn.contents) {
                if (mrayDragOBJs && (mrayDragOBJs.indexOf(obj) != -1)) {
                  continue
                }
                if (obj.spec && spclasses.indexOf(obj.spec.spatialClass) != -1) {
                  up = coord.up
                  forward = coord.forward
                  mp3d = coord
                  if (activeTool.spec.pickOut) {
                    switch(up) {
                      case direction.code.UP:
                        coord.y++
                        break
                      case direction.code.DOWN:
                        coord.y--
                        break
                      case direction.code.NORTH:
                        coord.z++
                        break
                      case direction.code.EAST:
                        coord.x--
                        break
                      case direction.code.SOUTH:
                        coord.z--
                        break
                      case direction.code.WEST:
                        coord.x++
                        break
                    }
                  }
                  // cancel the plotting operation
                  return false
                }
              }
            }
            //continue the plotting operation
            return true
          }
          
          // Plot a line from the mouse position, outward from the camera
          // (mouse position is the screen-space mouse coordinates, projected onto the camera's backplane)
          if (draw_debugline) {
            if (debug_obj) {
              vxc.scene.remove(debug_obj)
              for (let ch of debug_obj.children) {
                if (ch.isGeometry) {
                  ch.dispose()
                }
                if (ch.material) {
                  ch.material.dispose()
                }
              }
            }
            debug_obj = debugLine(origin, ray_end, plot)
            vxc.scene.add(debug_obj)
            draw_debugline = false
            controlActive = true
          }
          else {
            plotLine(origin, ray_end, plot)
            controlActive = true
          }
        } break
      } 
      
      if (mp3d) {
        //point
        edCTL.event.dispatchEvent( new Event("mousemove_point"))
          
        let x = Math.round(mp3d.x)
        let y = Math.round(mp3d.y)
        let z = Math.round(mp3d.z)
        
        //cube
        if ( (x != cursor3d.x) | (y != cursor3d.y) | (z != cursor3d.z)) {
          put(cursor3d, x,y,z)
          controlActive = true
          edCTL.event.dispatchEvent(new Event("mousemove_cube"))
        }
        //face + alignment
      }
    }
  })()}
  
  let build = function() {
    let obj = {}
    obj.data = {}
    for (let k in activeTool.spec.params) {
      if (obj[k] == undefined) {
        obj[k] = activeTool.spec.params[k]
      }
    }
    obj.spec = activeTool.spec
    obj.data.$ = [activeTool.templateID, cursor3d.x, cursor3d.y, cursor3d.z]
    if (activeTool.terrainID) {
      obj.terrainID = activeTool.terrainID
      obj.data.$.push(activeTool.terrainID)
    }
    //else if (activeTool.align != undefined) {
      //obj.data.$.push(align.up)
      //obj.data.$.push(align.forward)
    //}
      // if an aligned object, append the alignment
    if (mrayDragOBJs) {
      mrayDragOBJs.push(obj)
      if (mrayDragOBJs.length >= MrayDragLimit) {
        mrayDragOBJs.shift(1)
      }
    }
    put(obj, cursor3d.x, cursor3d.y, cursor3d.z)
  }
  
  let opSpecs = {
    buildcube: { click:build, drag:build, drag_evttype:"mousemove_cube" }
  }
  
  let handleInput = async function(opspec) {
    let evtman = new NextEventManager()
    outer:
    while (true) {
      let evt = await evtman.next(disp_elem, "lmb_down", edCTL.event, "cancel")
      if (evt.vname == "cancel") {
        return
      }
      if (pickmode == "mray") {
        //draw_debugline = true
        if (!mrayDragOBJs || mrayDragOBJs.length != 0) {
          mrayDragOBJs = []
        }
      }
      else {
        recentPos.x = cursor3d.x
        recentPos.y = cursor3d.y
        recentPos.z = cursor3d.z
        mrayDragOBJs = undefined
      }
      if (opspec.click) { opspec.click() }
      if (opspec.drag_evttype) {
        inner:
        while (true) {
          evt = await evtman.next(disp_elem, "lmb_up", edCTL.event, opspec.drag_evttype, "cancel")
          switch(evt.vname) {
            case "cancel":
              if (opspec.cancel) { opspec.cancel() }
              return
            case "lmb_up":
              if (!mrayDragOBJs || mrayDragOBJs.length != 0) {
                mrayDragOBJs = []
              }
              if (opspec.release) { opspec.release() }
              break inner
            case opspec.drag_evttype:
              if (opspec.drag) { opspec.drag() }
              break
          }
          if (pickmode != "mray") {
            recentPos.x = cursor3d.x
            recentPos.y = cursor3d.y
            recentPos.z = cursor3d.z
          }
        }
      }
    }
  }
  
  let next_templateID = 1
  let templates = {}
  
  let tools = {}
  let defineTool = function(spec) {
    //wrap the spec
    let tool = {
      spec:spec,
      colors:[]
    }
    
    // If pickModes is specified as a string, expand it to an array.
    if (typeof(spec.pickModes) == "string") {
      switch(spec.pickModes) {
        case "any":
          spec.pickModes = ["xz", "xy", "yz", "pick"]
          break
        case "planar":
          spec.pickModes = ["xz", "xy", "yz"]
          break
        default:
          spec.pickModes = [spec.pickModes.split(" ")]
          break
      }
    }

    if (typeof(spec.spclassPick) == "string") {
      spec.spclassPick = spec.spclassPick.split(" ")
    }
    
    if (typeof(spec.spclassCoexist) == "string") {
      spec.spclassCoexist = spec.spclassCoexist.split(" ")
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
    
    if (spec.terrain) {
      if (!spec.terrain.name) {
        spec.terrain.name = spec.type
      }
      defineTerrain(spec.terrain)
    }
    
    if (!anythingIN(spec.template)) {
      spec.template = {type:spec.type}
    }
    
    tool.templateID = next_templateID
    templates[next_templateID] = spec.template
    next_templateID++
    
    //store the tool
    tools[spec.name] = tool
    
    
  //let addEditorBTN = edCTL.addEditorBTN = function(name, desc, value, init_active, position, activeClass, sheet, row, col, hue, hdev) {
  //addEditorBTN("MRAY", "Pick against object under mouse cursor", setMraypickmode, false, "options", "pickmode", "editoricons", 0, 0, 40, 5)
  
    addEditorBTN(
      spec.shortname ? spec.shortname : spec.name, 
      spec.desc ? spec.desc : spec.name,
      spec.name, 
      false, 
      "tools", 
      "*", 
      spec.icon.sheet, spec.icon.row, spec.icon.col, 
      275, 5
    )
    
  }
  
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
      
      //if a default primary color is specified, use it.  Otherwise, use the first.
      if (activeTool.spec.color.mainIndex != undefined) {
        mainBTNS[activeTool.spec.color.mainIndex].setPrimary()
      }
      else if (mainBTNS.length > 0) {
        mainBTNS[0].setPrimary()
      }
    }
    updateColors()
  }
  
  // BoxTerrain configuration section
  // Purpose of this is to expose the internal features of BoxTerrain (multiple sets of boundary graphics from a texture atlas, arbitrary decals from a second 
  // texture atlas, and unique configurations for each of the 6 directions)
  
  let ddefs = {}
  let toDecalParams = function(decalSpec) {
    let k = JSON.stringify(decalSpec)
    if (ddefs[k]) {
      return ddefs[k]
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
  
  let bxtsfcdefiners = {}   //box terrain surface definers
  let next_terrainid = 1
  let next_sfcid = 1
  let terrainIDs = {}       // terrain IDs (to avoid inserting duplicate terrain definitions into BoxTerrain)
  let sfcIDs = {}           // surface IDs (to avoid inserting duplicate surface definitions into BoxTerrain)
  let surfaceDefs = {}
  let terrainDefs = {}
  let defineTerrain = function(terrspec) {
    //surfaceDefs[name] = sfcdef
    
    // Set up the "decal" specifications for all directions
    //  (the decal specifciation is the secondary texture coordinates for 
    let nd, ed, sd, wd, ud, dd
    if (terrspec.decal.all) {
      nd = ed = sd = wd = ud = dd = toDecalParams(terrspec.decal.all)
    }
    if (terrspec.decal.h) {
      ud = dd = toDecalParams(terrspec.decal.h)
    }
    if (terrspec.decal.v) {
      nd = ed = sd = wd = toDecalParams(terrspec.decal.v)
    }
    if (terrspec.decal.n) {
      nd = toDecalParams(terrspec.decal.n)
    }
    if (terrspec.decal.e) {
      ed = toDecalParams(terrspec.decal.e)
    }
    if (terrspec.decal.s) {
      sd = toDecalParams(terrspec.decal.s)
    }
    if (terrspec.decal.w) {
      wd = toDecalParams(terrspec.decal.w)
    }
    if (terrspec.decal.u) {
      ud = toDecalParams(terrspec.decal.u)
    }
    if (terrspec.decal.d) {
      dd = toDecalParams(terrspec.decal.d)
    }
    
    let ddefs = [nd, ed, sd, wd, ud, dd]
    
    let facedefs = [{}, {}, {}, {}, {}, {}]
    
    for (let i = 0; i < 6; i++) {
      Object.assign(facedefs[i], ddefs[i])
    }
    
    if (terrspec.primary.all) {
      apply8bitTerrspec(facedefs[0], terrspec.primary.all)
      apply8bitTerrspec(facedefs[1], terrspec.primary.all)
      apply8bitTerrspec(facedefs[2], terrspec.primary.all)
      apply8bitTerrspec(facedefs[3], terrspec.primary.all)
      apply8bitTerrspec(facedefs[4], terrspec.primary.all)
      apply8bitTerrspec(facedefs[5], terrspec.primary.all)
    }
    if (terrspec.primary.v) {
      apply8bitTerrspec(facedefs[0], terrspec.primary.v)
      apply8bitTerrspec(facedefs[1], terrspec.primary.v)
      apply8bitTerrspec(sfcdefs[2], terrspec.primary.v)
      apply8bitTerrspec(facedefs[3], terrspec.primary.v)
    }
    if (terrspec.primary.h) {
      apply8bitTerrspec(facedefs[4], terrspec.primary.h)
      apply8bitTerrspec(facedefs[5], terrspec.primary.h)
    }
    if (terrspec.primary.n) {
      apply8bitTerrspec(facedefs[0], terrspec.primary.n)
    }
    if (terrspec.primary.e) {
      apply8bitTerrspec(facedefs[1], terrspec.primary.e)
    }
    if (terrspec.primary.s) {
      apply8bitTerrspec(facedefs[2], terrspec.primary.s)
    }
    if (terrspec.primary.w) {
      apply8bitTerrspec(facedefs[3], terrspec.primary.w)
    }
    if (terrspec.primary.u) {
      apply8bitTerrspec(facedefs[4], terrspec.primary.u)
    }
    if (terrspec.primary.d) {
      apply8bitTerrspec(facedefs[5], terrspec.primary.d)
    }
    
    let baseK = JSON.stringify(terrspec)+"|"
    
    //console.log(facedefs)
    
    bxtsfcdefiners[terrspec.name] = function config_bxt(colors) {
      let k = baseK + colors.join(" ")
      if (terrainIDs[k]) {
        return terrainIDs[k]
      }
      
      for (let i = 0; i < colors.length; i++) {
        colors[i] = toRGBstring(colors[i])
      }
      
      // If a map is specified, use it to expand/rearrange the color array
      if (terrspec.map) {
        colors = [
          colors[terrspec.map[0]],
          colors[terrspec.map[1]],
          colors[terrspec.map[2]],
          colors[terrspec.map[3]],
          colors[terrspec.map[4]],
          colors[terrspec.map[5]]
        ]
      }
      else {
        //If no map is specified, but the input color array is short, use a builtin mapping to expand it to 6 colors
        //  Builtin mapping generally colors a cube from top to bottom
        switch(colors.length) {
          case 1:
            colors = [colors[0], colors[0], colors[0], colors[0], colors[0], colors[0]]
            break
          case 2:
            colors = [colors[1], colors[1], colors[1], colors[1], colors[0], colors[0]]
            break
          case 3:
            colors = [colors[1], colors[1], colors[1], colors[1], colors[0], colors[2]]
            break
          case 4:
            colors = [colors[1], colors[2], colors[1], colors[2], colors[0], colors[3]]
            break
          case 5:
            colors = [colors[1], colors[2], colors[3], colors[4], colors[0], colors[0]]
            break
          case 6:
            colors = [colors[1], colors[2], colors[3], colors[4], colors[0], colors[5]]
            break
        }
      }
      
      //Configure the box terrain for each surface [with the corresponding  input color]
      //    (maybe think about preparing only one surface for each unique color-decaldef pair - present approach is just to not care about that...)
      let tid = next_terrainid
      terrainIDs[k] = tid
      let sfcdefids = [tid]
      next_terrainid++
      for (let i = 0; i < 6; i++) {
        let fdef = facedefs[i]
        let sfcparams = {
          color:colors[i],
          uv2info:fdef
        }
        let k = JSON.stringify(sfcparams)
        let sfcid = sfcIDs[k]
        if (sfcid) {
          sfcdefids[i+1] = sfcid
          continue
        }
        else {
          bxtbldr.defineSurface_8bit(next_sfcid, {
            color:colors[i],
            uv2info:fdef
          })
          surfaceDefs[next_sfcid] = { color:colors[i], uv2info:fdef }
          sfcIDs[k] = next_sfcid
          sfcdefids[i+1] = next_sfcid
          next_sfcid++
        }
      }
      bxtbldr.defineTerrain.apply(bxtbldr, sfcdefids)
      terrainDefs[tid] = sfcdefids.slice(1)
      //console.log(facedefs, colors, sfcdefids)
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
  
  edCTL.configure = (async function(cfg) {
    if (typeof(cfg) == "string") {
      cfg = JSON.parse(cfg)
    }
    let appname = cfg.AppName
    if (!appname) {
      appname = "SomeoneDidntAssignThe_AppName"
    }
    
    edCTL.AppName = appname
    edCTL.DataVersion = cfg.DataVersion
    
    let rscver = cfg.EdrscVersion|0
    let prev_ver = 0|parseInt(window.localStorage[appname+"EDVER"])
    let reloadOPT = (rscver > prev_ver) ? {cache:"no-store"} : undefined
    window.localStorage[appname+"EDVER"] = rscver
    
    if (cfg.Resources) {
      try {
        let update = async function(propname, loadit) {
          let result = await loadit(reloadOPT)
          return result
        }
        
        let promises = []
        let textureRefs = []
        for (let rscname in (cfg.Resources)) {
          let data = cfg.Resources[rscname]
          if (data.type == "texture") {
            textureRefs.push({
              name:rscname,
              url:data.src,
              properties:TextureProps
            })
          }
        }
        if (textureRefs.length > 0) {
          promises.push(
            update(appname, (fetchOPTS)=>{
              return loadMuch( edCTL.assets, fetchOPTS, textureRefs )
            }),
          )
        }
        
        // Whene everything is loaded, update local storage with the versions of the cached files
        await Promise.all(promises)
        console.log("Loaded Ekvxed2 app-resources")
      }
      catch (err) {
        console.log("ERROR loading app-resources:", err)
      }
    }
    
    if (cfg.Tools) {
      for (let tooldef of cfg.Tools) {
        if (tooldef.extend) {
          tooldef = Object.assign({}, cfg.AbstractTools[tooldef.extend], tooldef)
          defineTool(tooldef)
        }
        else {
          defineTool(tooldef)
        }
        if (tooldef.default) {
          setTool(tooldef.name)
        }
        
        console.log("TDEF:", tooldef)
      }
    }
  }).bind(this)
  
  if (document.DEFAULT_EDITOR_CFG) {
    edCTL.configure(document.DEFAULT_EDITOR_CFG)
  }
  /*
  defineTool({
    type:"wall",                            // object type indicator
    name:"Wall",                            // Name for reference and display in-editor
    pickModes:["xz", "xy", "yz", "pick"],   // use all pickmodes, default to "xz"
    alignMode:"none",                       // no alignment
    pickOut:true,                           // If in mouse-ray pick mode, pick the space "on top" of the picked object
    spatialClass:"solid",                   // Tag used in-editor for picking and coexistance checks (not intended to be data)
    spclassPick:["solid"],                  // allow picking against objects of these classes
    spclassCoexist:[],                      // Objects that the defined object may coexist with
    planarPick:true,                        // allow picking against XY, XZ, and YZ planes
    routine:"buildcube",                    // Input handler to run while tool is active
    template:{},                            // Put these properties in the template
    color:{                                 // Colorable object declaration
      amount:3,                             // Number of [defined] colors 
      default:["white", "green", "blue"],   // default for each defined color
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
  */
  let serialize = function() {
    let o = {
      surfaceDefs:surfaceDefs,
      terrainDefs:terrainDefs,
      templates:templates,
      objects:[],
    }
    vxc.forAll((ctn)=>{
      if (ctn.contents && ctn.contents.length > 0) {
        for (let obj of (ctn.contents)) {
          console.log(obj)
          if (obj.data) {
        
            o.objects.push(obj.data)
          }
        }
      }
    })
    return JSON.stringify(o)
  }
  /*
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
  */
  
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
    
    if (vxc) {
      controlActive |= vxc.buildChunks()
    }
    
    if (controlActive) {
      controlActive = false
      renderCTL.display.render()
    }
  }
  run()
})





















