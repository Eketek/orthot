export { buildVariantMaterial, UVspec, UV_ATTRIBUTE_PREFIX, ManagedColor }
import { getUID } from '../libek/libek.js'

  /* A shader variation generator.  -- A simple and convenient way to inject custom GLSL into shader (as well as to configure the Material).

     base:    Name of the builtin shader to make a variant of, or an object containing either [GLSL vertex and fragment shaders] or [THREE.js shader-lib code]
              Any words marked with a '$' will be replaced with GLSL shader code attached to the params object [with the same name]

     params:  An object that defines all inputs to add to the shader
              This accepts Textures, Vectors, Colors, Numbers, and UV specifications.
              Each entry in this object is converted into an equivalent value in the shader.
              Strings entries are [mostly] GLSL code - to be inserted into the shader at a location in the shader with the same name as the params entry
              Texture coordinates are a special case - A uv generator will be added to the Vertex Shader for every entries which have a [string] value of "uv"
                The Vertex Shader name for custom uv generators is "attr_<name>" (name prefixed with "attr_") - use that name for adding secondary UVs to Meshes.
              A texture named "map" is also assumed to be the main texture (and named "map" in the FragmentShader)
              The main uv generator is "vUv" (and will always be present)

      This returns THREE.Material, with the compiled shader, and all specified properties attached to the Material uniforms params object.
        (and anything else that would go into MeshStandardMaterial)

      //SHADER VARIATION EXAMPLE:
      //Modify MeshStandard shader to make use of a custom colorizing function
      //  sampling operation:  R -> vertex color, G -> col1, B -> col2, FG.A -> FG-alpha-blend factor, BG.A -> ignored
      let material = libek.shader.buildVariantMaterial("standard", {
        map:some_ForegroundTexture,                                       //
        bg:some_BackgroundTexture,                                        //
        bguv:"uv",                                                        // Background texture UV specification
        col1:new THREE.Color(`hsl(${Math.random()*360}, 75%, 25%)`),      // Constant color
        col2:new THREE.Color(`hsl(${Math.random()*360}, 100%, 50%)`),     // Another constant color
        roughness:0.6,                                                    // MeshStandard shader property
        metalness:0.1,                                                    // MeshStandard shader property
        sample:`                                                          // GLSL code defining the texture sampling function
          vec4 mc = texture2D( map, vUv );
          vec4 bc = texture2D( bg, bguv );
          vec3 fgColor = vColor*mc.r + col1*mc.g + col2*mc.b;
          vec3 bgColor = vColor*bc.r + col1*bc.g + col2*bc.b;
          sample = vec4(fgColor * mc.a + bgColor*(1.0-mc.a), 1.0);
        `
      })

      managed vs unmanaged params:

      VariantMaterial may be paramterized with either unmanaged or managed objects.  Unmanaged parameters are value-type parameters.  Managed parameters are
      reference-type paramters.  Use Managed parameters for shader paramaters that need to auto-update when altered.  Use uUnmanaged paramters for shader
      paramters that should be changed only manually.

      NOTE:  "Unmanaged" THREE.js Objects used as shader parameters are intentionally cloned (to prevent them from acting like Managed Paramters).
  */
var buildVariantMaterial = function(base, params) {
  if (typeof(base) == "string") {
    base = builtinShaders[base]
  }
  let textures = {}
  let color = {}
  let vec2 = {}
  let vec3 = {}
  let vec4 = {}
  let float = {}
  let uvspec = {}
  let code = {}

  let addParamTo = function(name, val, target) {
    for (let k in target) {
      if (target[k].equals && target[k].equals(val)) {
        return k
      }
      if (target[k] == val) {
        return k
      }
    }
    target[name] = val
    return name
  }

  let addParam = function(k, v, is_tt_param=false) {
    switch (typeof(v)) {
      case "object": {
        if (v.isTexture) {
          return addParamTo(k,v,textures)
          //textures[k] = v
        }
        else if (v.isVector2) {
          return addParamTo(k,v,vec2)
          //vec2[k] = v
        }
        else if (v.isVector3) {
          return addParamTo(k,v,vec3)
          //vec3[k] = v
        }
        else if (v.isVector4) {
          return addParamTo(k,v,vec4)
          //vec4[k] = v
        }
        else if (v.isColor) {
          return addParamTo(k, v, color)
          //return addParamTo(k,new THREE.Vector3(v.r, v.g, v.b), vec3)
          //vec3[k] = new THREE.Vector3(v.r, v.g, v.b)
        }
        else if (v.isTaggedTemplate) {
          let str = ''
          for (let i = 0; i < v.strings.length; i++) {
            str += v.strings[i]
            if (v.params[i]) {
              let name = addParam("ttpar_" + getUID(), v.params[i], true)
              str += name
            }
          }
          code[k] = str
        }
        else if (v.isManagedFloat) {
          return addParamTo(k,v,float)
        }
        else if (v.isUVspec) {
          return addParamTo(k, v, uvspec)
//            uvspec[k] = v
        }
      }
      break
      case "number":
        float[k] = v
        return k
      break
      case "string": {
        if (is_tt_param) {

        }
        else {
          switch(v) {
            case "uv":
            case "texcoord":
              uvspec[k] = new UVspec(k)
            break
            default:
              code[k] = v
              return k
            break
          }
        }
      }
      break
    }
  }

  for (let k in params) {
    if (_MATOBJ_PARAMS.indexOf(k) == -1) {
      addParam(k,params[k])
    }
    //let v = params[k]
  }

  let maintex

  let uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms)
  let vtx_init = ''
  let vtx_main = ''
  let frg_init = ''
  for (let name in uvspec) {
    let attrname = uvspec[name].attrname
    vtx_init = `${vtx_init}\nattribute vec2 ${attrname};\nvarying vec2 ${name};`
    vtx_main = `${vtx_main}\n${name} = ${attrname};`
    frg_init = `${frg_init}\nvarying vec2 ${name};`
  }
  for (let name in textures) {
    switch(name) {
      case "map":
        maintex = textures[name]
      break
      default:
        frg_init = `${frg_init}\nuniform sampler2D ${name};`
      break
    }
    if (textures[name].isManagedParam) {
      uniforms[name] = textures[name]
    }
    else {
      //uniforms[name] = {value:textures[name].clone()}
      uniforms[name] = {value:textures[name]}
    }
  }
  for (let name in vec2) {
    switch(name) {
      default:
        frg_init = `${frg_init}\nuniform vec2 ${name};`
      break
    }
    if (vec2[name].isManagedParam) {
      uniforms[name] = vec2[name]
    }
    else {
      uniforms[name] = {value:vec2[name].clone()}
    }
  }

  for (let name in vec3) {
    switch(name) {
      case "diffuse":
      case "emissive":
      break
      default:
        frg_init = `${frg_init}\nuniform vec3 ${name};`
      break
    }

    if (vec3[name].isManagedParam) {
      uniforms[name] = vec3[name]
    }
    else {
      uniforms[name] = {value:vec3[name].clone()}
      //uniforms[name] = {value:vec3[name]}
    }
  }

  for (let name in vec4) {
    frg_init = `${frg_init}\nuniform vec4 ${name};`
    if (vec4[name].isManagedParam) {
      uniforms[name] = vec4[name]
    }
    else {
      uniforms[name] = {value:vec4[name].clone()}
    }
  }

  for (let name in color) {
    frg_init = `${frg_init}\nuniform vec3 ${name};`
    if (color[name].isManagedParam) {
      uniforms[name] = color[name]
    }
    else {
      uniforms[name] = {value:color[name].clone()}
    }
  }
  for (let name in float) {
    switch(name) {
      case "roughness":
      case "metalness":
      case "opacity":
      break
      default:
        frg_init = `${frg_init}\nuniform float ${name};`
      break
    }
    if (float[name].isManagedParam) {
      uniforms[name] = float[name]
    }
    else {
      uniforms[name] = {value:float[name]}
    }
  }

  for (let name in base.default) {
    if (!code[name]) {
      code[name] = base.default[name]
    }
  }

  let vtxSHD = base.vshader.replace("$INIT", vtx_init).replace("$MAIN", vtx_main)
  let frgSHD = base.fshader.replace("$INIT", frg_init)

  for (let k in code) {
    let prg = code[k]
    k = '$' + k
    if (frgSHD.indexOf(k) != -1) {
      frgSHD = frgSHD.replace(k, prg)
    }
    else if (vtxSHD.indexOf(k) != -1) {
      vtxSHD = vtxSHD.replace(k, prg)
    }
  }
  //console.log(vtxSHD)
  //console.log(frgSHD)

  let matparams = {
    uniforms:uniforms,
    vertexShader:vtxSHD,
    fragmentShader:frgSHD,
    lights: true,
    vertexColors:THREE.VertexColors
  }
  if (params.side) {
    matparams.side = params.side
  }

  let mat = new THREE.ShaderMaterial(matparams)
  mat.transparent = params.transparent

  if (maintex) {
    if (maintex.isManagedParam) {
      mat.map = maintex.value
    }
    else {
      mat.map = maintex
    }
 }


  return mat
}

var builtinShaders = {
  standard:{
    vshader:`
      $INIT
      #define PHYSICAL
      varying vec3 vViewPosition;
      #ifndef FLAT_SHADED
        varying vec3 vNormal;
      #endif
      #include <common>
      #include <uv_pars_vertex>
      #include <uv2_pars_vertex>
      #include <displacementmap_pars_vertex>
      #include <color_pars_vertex>
      #include <fog_pars_vertex>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      #include <shadowmap_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      #include <clipping_planes_pars_vertex>
      void main() {
        $MAIN
        #include <uv_vertex>
        #include <uv2_vertex>
        #include <color_vertex>
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
      #ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED
        vNormal = normalize( transformedNormal );
      #endif
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        #include <displacementmap_vertex>
        #include <project_vertex>
        #include <logdepthbuf_vertex>
        #include <clipping_planes_vertex>
        vViewPosition = - mvPosition.xyz;
        #include <worldpos_vertex>
        #include <shadowmap_vertex>
        #include <fog_vertex>
      }`,
    fshader:`
      $INIT
      #define PHYSICAL
      uniform vec3 diffuse;
      uniform vec3 emissive;
      uniform float roughness;
      uniform float metalness;
      uniform float opacity;
      #ifndef STANDARD
        uniform float clearCoat;
        uniform float clearCoatRoughness;
      #endif
      varying vec3 vViewPosition;
      #ifndef FLAT_SHADED
        varying vec3 vNormal;
      #endif
      #include <common>
      #include <packing>
      #include <dithering_pars_fragment>
      #include <color_pars_fragment>
      #include <uv_pars_fragment>
      #include <uv2_pars_fragment>
      #include <map_pars_fragment>
      #include <alphamap_pars_fragment>
      #include <aomap_pars_fragment>
      #include <lightmap_pars_fragment>
      #include <emissivemap_pars_fragment>
      #include <bsdfs>
      #include <cube_uv_reflection_fragment>
      #include <envmap_pars_fragment>
      #include <envmap_physical_pars_fragment>
      #include <fog_pars_fragment>
      #include <lights_pars_begin>
      #include <lights_physical_pars_fragment>
      #include <shadowmap_pars_fragment>
      #include <bumpmap_pars_fragment>
      #include <normalmap_pars_fragment>
      #include <roughnessmap_pars_fragment>
      #include <metalnessmap_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      #include <clipping_planes_pars_fragment>
      void main() {
        #include <clipping_planes_fragment>
        vec4 diffuseColor = vec4( diffuse, opacity );
        ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
        vec3 totalEmissiveRadiance = emissive;
        #include <logdepthbuf_fragment>

        vec4 sample;
        $sample;
        diffuseColor = mapTexelToLinear(sample);

        #include <alphamap_fragment>
        #include <alphatest_fragment>
        #include <roughnessmap_fragment>
        #include <metalnessmap_fragment>
        #include <normal_fragment_begin>
        #include <normal_fragment_maps>
        #include <emissivemap_fragment>
        // accumulation
        #include <lights_physical_fragment>
        #include <lights_fragment_begin>
        #include <lights_fragment_maps>
        #include <lights_fragment_end>
        // modulation
        #include <aomap_fragment>
        vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
        gl_FragColor = vec4( outgoingLight, diffuseColor.a );
        #include <tonemapping_fragment>
        #include <encodings_fragment>
        #include <fog_fragment>
        #include <premultiplied_alpha_fragment>
        #include <dithering_fragment>
      }
    `,
    default:{
      sample:`sample = texture2D( map, vUv )`
    }
  }
}

var ManagedVec2 = function(arg) {
  this.isManagedParam = true
  this.isVector2 = true

  if (arg.isVector2) {
    this.value = arg
  }
  else {
    this.value = new THREE.Vector2()
  }
}

var ManagedVec3 = function(arg) {
  this.isManagedParam = true
  this.isVector3 = true

  if (arg.isVector3) {
    this.value = arg
  }
  else {
    this.value = new THREE.Vector3()
  }
}
var ManagedVec4 = function(arg) {
  this.isManagedParam = true
  this.isVector4 = true

  if (arg.isVector4) {
    this.value = arg
  }
  else {
    this.value = new THREE.Vector4()
  }
}
var ManagedFloat = function(arg) {
  this.isManagedParam = true
  this.isManagedFloat = true

  if (typeof(arg) == "number") {
    this.value = arg
  }
  else if (typeof(arg) == "string") {
    this.value = Number.parseFloat(arg)
  }
  else {
    this.value = 0
  }
}
var ManagedTexture = function(arg) {
  this.isManagedParam = true
  this.isTexture = true
  this.value = arg
}

var ManagedColor = function(arg) {
  this.isManagedParam = true
  this.isColor = true
  if (typeof(arg) == "string") {
    this.value = new THREE.Color(arg)
  }
  else if (arg.isVector3) {
    this.value = new THREE.Color(arg.x, arg.y, arg.z)
  }
  else if (arg.isColor) {
    this.value = arg
  }
  else {
    this.value = new THREE.Color()
  }

  Object.defineProperty(this, 'r', {
    get: function() { return this.value.x },
    set: function(v) { this.value.x = v; }
  })
  Object.defineProperty(this, 'g', {
    get: function() { return this.value.y },
    set: function(v) { this.value.y = v }
  })
  Object.defineProperty(this, 'b', {
    get: function() { return this.value.z },
    set: function(v) { this.value.z = v }
  })
}

  /*  This is a more consistant handle for referencing Texture Coordinates by code that manipulates BufferGeometry objects and Shaders.
      This also is somewhat of a shim.
   */
var UVspec = function(name, attrname) {
  this.isUVspec = true
  this.name = name ? name : "uv_" + getUID()
  this.attrname = attrname ? attrname : UV_ATTRIBUTE_PREFIX+this.name
}

  //This is automatically prepended to custom UV spec names where appropriate, to allow the the mesh generator, the shader parameterizer, and the fragment
  //  shader to use the same name to reference logically associated data.
var UV_ATTRIBUTE_PREFIX = "attr_"
var _MATOBJ_PARAMS = ["side"]

























