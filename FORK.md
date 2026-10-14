# three.js-gpu

This is a fork of [three.js](https://github.com/mrdoob/three.js) that tracks upstream closely and carries a small number of WebGPU patches for projects that need them. Upstream has not accepted them; see [Upstream status](#upstream-status).

The previous contents of this repository, the vibegameengine r182 renderer experiments, are kept unchanged on [`archive/vibegameengine-r182`](https://github.com/Vyzerythe/three.js-gpu/tree/archive/vibegameengine-r182).

## Branches

| Branch | Contents |
|---|---|
| `dev` | Exact mirror of upstream `dev`. |
| `master` | Exact mirror of upstream `master`, the released versions (currently r186 bis, npm `three@0.186.1`). |
| `main` | Upstream `dev` plus this fork's patches. |
| `release/r186` | npm `three@0.186.1` plus the storage patches, the upstream fixes they depend on, and rebuilt `build/` files. Projects pin to a commit on this branch. |
| `archive/vibegameengine-r182` | The previous fork, for reference. |

## Patches

| Patch | What it changes | `main` | `release/r186` |
|---|---|---|---|
| **StorageBufferAttribute: Allocate CPU data only when accessed.** | A storage attribute created from a count (`instancedArray( count, type )`, `attributeArray( count, type )`, `new StorageBufferAttribute( count, itemSize )`) used to allocate a zero-filled CPU array, copy it into the GPU buffer and keep it for its whole life. On the WebGPU backend its GPU buffer is now created zero-initialized without an upload, and `array` is only allocated if JavaScript accesses it, so compute-only data no longer cost the same memory twice. Setting `array = null` releases the CPU copy. Adds `arrayType` and `hasCPUData`. The WebGL 2 backend still allocates and uploads `array`. | yes | yes |
| **StorageBufferAttribute: Keep the array type when releasing the array.** | Assigning `array` records its type, so an array allocated again after `array = null` has the type last assigned: an array replaced directly or by `copy()`, or the 32-bit array the WebGPU backend substitutes for 8- and 16-bit integer data. Before, it fell back to the type the attribute was created with. | yes | yes |
| **WebGPUAttributeUtils: Fix padded storage attribute updates.** | A vec3 storage attribute is padded to vec4 when its buffer is created and from then on holds the padded layout (`itemSize` 4). Upstream pads it again on every `needsUpdate`, reading it as packed vec3 data; here it is uploaded as it is, so CPU-side updates, including update ranges, are written in the padded layout. | yes | yes |
| **WebGPUAttributeUtils: Release readback buffers when mapping fails.** | When `mapAsync()` rejects in `getArrayBufferAsync()`, the temporary read buffer is destroyed instead of being left to garbage collection, and a `ReadbackBuffer` target is unlocked instead of staying marked as mapped until `release()`. The error is rethrown unchanged. | yes | yes |
| **Renderer: Invalidate override materials by their source materials.** | Shadow and `scene.overrideMaterial` passes copied `alphaTest` through its setter. Casters alternating between alpha-tested and opaque materials therefore bumped the override material's version on every draw, recomputing every render object's cache key each frame: 400 casters went from 15.9 to 7.8 ms median `render()` CPU. A source material's own changes, such as a newly added `map`, also never reached its shadow pipeline. | yes | no |
| **Instance: Copy previous instance matrices only when they changed.** | With velocity (motion blur, TAA) enabled, every instanced mesh copied its whole instance matrix array every frame, even when nothing moved. Dynamic (`DynamicDrawUsage`) buffers still copy every frame, since they upload without a version change. | yes | no |
| **Geometries: Only delete attributes no other geometry uses on dispose.** | Disposing one geometry destroyed the buffers of attributes shared with other geometries. Their next draw failed with "setIndexBuffer … not of type GPUBuffer", unset vertex buffers or "used in submit while destroyed". | yes | no |
| **VelocityNode: Always update camera uniforms.** | Only the first velocity node per camera and frame received the camera matrices. Other velocity nodes, and a camera rendered again after another camera, produced wrong motion vectors. | yes | no |

The last four are general fixes that `release/r186` does not need for its current users. They have not been proposed upstream or reviewed beyond the tests below. Backport them to a release branch when a project needs them.

`release/r186` also carries these upstream fixes, which are on upstream `dev` and will ship in r187:

| Upstream commit | Why it is needed |
|---|---|
| #34664 StorageBufferAttribute: Add support for disposing storage buffer attributes | Makes `attribute.dispose()` free the GPU buffer of a storage attribute. |
| #34666 StorageBufferAttribute: Fix feedback on disposal | Follow-up to #34664. |
| #34939 NodeStorageBuffer: Fix stale attribute references | Storage bindings no longer hold on to the attribute's array, which would otherwise allocate the CPU copy the first patch avoids. |

## Upstream status

The storage patches were proposed upstream as #34995 (CPU data on access, with the array type fix), #34993 (padded updates) and #34994 (readback release), and closed without being merged.

- **Padded updates:** upstream's position is that this changes how CPU-side updates of vec3 storage attributes work and breaks code written for the current behavior, which writes packed vec3 data and lets the renderer pad it on each update. The fork keeps the change because the first patch already gives count-created vec3 attributes the padded layout once their buffer exists, and without it the layout for updates would depend on whether `array` was first accessed before or after that. Code written for upstream that updates vec3 storage data from the CPU in the packed layout must write the padded layout here.
- **Readback release:** upstream's position is that a mapping failure is rare and the temporary buffer is freed by garbage collection. The fork keeps the change; it only affects that failure path.

## Using the fork

Pin `three` to a commit of `release/r186` in `package.json`:

```json
"dependencies": {
	"three": "github:Vyzerythe/three.js-gpu#<commit>"
},
"overrides": {
	"three": "$three"
}
```

npm downloads that commit over HTTPS, so no SSH key is needed. It installs only the published package files (about 23 MB), the same set as the npm package. Imports stay `three`, `three/webgpu`, `three/tsl` and `three/addons/...`, because the release branch contains rebuilt `build/` files. `REVISION` stays `'186'`.

The lockfile records the commit. npm prints "skipping integrity check for git dependency", because git dependencies carry no tarball hash; the commit hash pins the content instead. `npm pack` on a release commit produces the same files as a tarball, which a project can keep in its own repository instead.

## Verification

The upstream unit suite runs in headless Chrome with real WebGPU compute. These results are from a laptop with Intel Iris Xe graphics.

| Check | Upstream `dev` | `main` | `release/r186` |
|---|---|---|---|
| Unit suite | 1958 tests, 1957 passed, 1 todo | 1979 tests, 1978 passed, 1 todo | 1332 tests, 1331 passed, 1 todo |
| Storage tests in `test/unit/src/renderers/common/StorageBufferAttribute.tests.js` (16) | 15 fail | 16 pass | 16 pass |
| New tests for the four general fixes (5, in `Geometries.tests.js` and `VelocityNode.tests.js`) | 5 fail | 5 pass | not applicable |
| Browser reproductions of the four general fixes (override churn, instance copies including a dynamic buffer, shared geometry disposal, velocity uniforms) | bug reproduced | fixed, identical pixels and velocities otherwise | not applicable |
| Render test: instanced quads from a GPU-only vec3 storage buffer, plus a quad drawn through a GPU-only index buffer | reference | pixel-identical, no CPU arrays | pixel-identical, no CPU arrays |

The storage test that passes on upstream `dev` writes data into `array` before first use, which works with and without the patches. On the GPU-only tests, upstream fails only the "no CPU array" assertions: the computed values are identical with and without the patches. With the earlier version of the first patch, `release/r186` fails exactly the three array type tests. Rebuilding unmodified `release/r186` reproduces its committed `build/` files byte for byte, so the rebuilt files differ only by the patches.

## Keeping it current

- **Mirrors:** fast-forward `dev` and `master` to upstream.
- **`main`:** merge upstream `dev` into it, then run the unit suite. Drop a patch once upstream has an equivalent.
- **A new upstream release (for example r187):** create `release/r187` from upstream `master` and cherry-pick the patches upstream does not have yet. Then run `npm ci && npm run build`, commit the build as "Updated builds.", run the unit suite, and move dependent projects to the new commit.
