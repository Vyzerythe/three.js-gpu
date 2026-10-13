# three.js-gpu

This is a fork of [three.js](https://github.com/mrdoob/three.js) that tracks upstream closely and carries a small number of WebGPU patches. Every patch is meant to go upstream; the fork exists so projects can use them before they are released.

The previous contents of this repository, the vibegameengine r182 renderer experiments, are kept unchanged on [`archive/vibegameengine-r182`](https://github.com/Vyzerythe/three.js-gpu/tree/archive/vibegameengine-r182).

## Branches

| Branch | Contents |
|---|---|
| `dev` | Exact mirror of upstream `dev`. |
| `master` | Exact mirror of upstream `master`, the released versions (currently r186 bis, npm `three@0.186.1`). |
| `main` | Upstream `dev` plus this fork's patches, one commit per patch, ready to send upstream. |
| `release/r186` | npm `three@0.186.1` plus the same patches, the upstream fixes they depend on, and rebuilt `build/` files. Projects pin to a commit on this branch. |
| `archive/vibegameengine-r182` | The previous fork, for reference. |

## Patches

| Patch | What it fixes | `main` | `release/r186` |
|---|---|---|---|
| **StorageBufferAttribute: Allocate CPU data only when accessed.** | A storage attribute created from a count (`instancedArray( count, type )`, `attributeArray( count, type )`, `new StorageBufferAttribute( count, itemSize )`) used to allocate a zero-filled CPU array, copy it into the GPU buffer and keep it for its whole life. Its GPU buffer is now created zero-initialized without an upload, and `array` is only allocated if JavaScript accesses it. Compute-only data no longer cost the same memory twice. Adds `arrayType` and `hasCPUData`. | yes | yes |
| **WebGPUAttributeUtils: Fix padded storage attribute updates.** | A vec3 storage attribute is padded to vec4 when its buffer is created, but every later `needsUpdate` padded the already padded data again, scrambling it. | yes | yes |
| **WebGPUAttributeUtils: Release readback buffers when mapping fails.** | A failed `getArrayBufferAsync()` leaked its temporary read buffer and left a `ReadbackBuffer` locked forever. | yes | yes |
| **Renderer: Invalidate override materials by their source materials.** | Shadow and `scene.overrideMaterial` passes copied `alphaTest` through its setter. Casters alternating between alpha-tested and opaque materials therefore bumped the override material's version on every draw, recomputing every render object's cache key each frame: 400 casters went from 15.9 to 7.8 ms median `render()` CPU. A source material's own changes, such as a newly added `map`, also never reached its shadow pipeline. | yes | no |
| **Instance: Copy previous instance matrices only when they changed.** | With velocity (motion blur, TAA) enabled, every instanced mesh copied its whole instance matrix array every frame, even when nothing moved. Dynamic (`DynamicDrawUsage`) buffers still copy every frame, since they upload without a version change. | yes | no |
| **Geometries: Only delete attributes no other geometry uses on dispose.** | Disposing one geometry destroyed the buffers of attributes shared with other geometries. Their next draw failed with "setIndexBuffer … not of type GPUBuffer", unset vertex buffers or "used in submit while destroyed". | yes | no |
| **VelocityNode: Always update camera uniforms.** | Only the first velocity node per camera and frame received the camera matrices. Other velocity nodes, and a camera rendered again after another camera, produced wrong motion vectors. | yes | no |

None of these patches has been proposed upstream yet. The last four are general fixes that `release/r186` does not need for its current users. Backport them to a release branch when a project does.

`release/r186` also carries these upstream fixes, which are on upstream `dev` and will ship in r187:

| Upstream commit | Why it is needed |
|---|---|
| #34664 StorageBufferAttribute: Add support for disposing storage buffer attributes | Makes `attribute.dispose()` free the GPU buffer of a storage attribute. |
| #34666 StorageBufferAttribute: Fix feedback on disposal | Follow-up to #34664. |
| #34939 NodeStorageBuffer: Fix stale attribute references | Storage bindings no longer hold on to the attribute's array, which would otherwise allocate the CPU copy the first patch avoids. |

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

The lockfile records the commit. npm prints "skipping integrity check for git dependency", because git dependencies carry no tarball hash; the commit hash pins the content instead.

## Verification

Each patch was checked against unmodified upstream, using the upstream unit suite, which runs real WebGPU compute in a browser.

| Check | Upstream `dev` | `main` | npm 0.186.1 | `release/r186` |
|---|---|---|---|---|
| Upstream unit suite | 1955 passed, 2 failed | 1955 passed, 2 failed (the same 2) | 1315 passed | 1315 passed |
| New tests for the last four patches (5, in `Geometries.tests.js` and `VelocityNode.tests.js`) | 5 fail | 5 pass | not applicable | not applicable |
| Browser reproductions of the last four patches (override churn, instance copies including a dynamic buffer, shared geometry disposal, velocity uniforms) | bug reproduced | fixed, identical pixels and velocities otherwise | not applicable | not applicable |
| New tests in `test/unit/src/renderers/common/StorageBufferAttribute.tests.js` (13) | 12 fail | 13 pass | 12 fail | 13 pass |
| Render test: instanced quads from a GPU-only vec3 storage buffer, plus a quad drawn through a GPU-only index buffer | reference | pixel-identical, no CPU arrays | reference | pixel-identical, no CPU arrays |

The two failures on `dev` occur on unmodified upstream too, and depend on the software WebGPU adapter used for testing. The new tests reproduce the vec3 update corruption and the readback leak on unmodified upstream. On the GPU-only tests, upstream fails only the "no CPU array" assertions: the computed values are identical with and without the patch. Rebuilding unmodified 0.186.1 reproduces its published `build/` files byte for byte, so the rebuilt files on `release/r186` differ only by the patches.

## Keeping it current

- **Mirrors:** fast-forward `dev` and `master` to upstream.
- **`main`:** merge upstream `dev` into it, then run the unit suite. Drop a patch once upstream has an equivalent.
- **A new upstream release (for example r187):** create `release/r187` from upstream `master` and cherry-pick the patches upstream does not have yet. Then run `npm ci && npm run build`, commit the build as "Updated builds.", run the unit suite, and move dependent projects to the new commit.

## Sending a patch upstream

Each patch is a single commit on `main`, based on upstream `dev`:

1. Create a branch from upstream `dev`.
2. Cherry-pick the patch commit onto it.
3. Push the branch.
4. Open a pull request against `mrdoob/three.js` `dev`.

The tests for the three storage patches share one file (`StorageBufferAttribute.tests.js`). Keep the relevant tests with each pull request.
