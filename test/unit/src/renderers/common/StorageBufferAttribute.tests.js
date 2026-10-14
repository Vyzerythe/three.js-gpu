import StorageBufferAttribute from '../../../../../src/renderers/common/StorageBufferAttribute.js';
import StorageInstancedBufferAttribute from '../../../../../src/renderers/common/StorageInstancedBufferAttribute.js';
import IndirectStorageBufferAttribute from '../../../../../src/renderers/common/IndirectStorageBufferAttribute.js';

import { ReadbackBuffer, WebGPURenderer } from '../../../../../src/Three.WebGPU.js';
import { Fn, instanceIndex, instancedArray, float, uint, vec3, vec4, struct, storage } from '../../../../../src/nodes/TSL.js';

let _renderer;

async function getRenderer() {

	if ( _renderer === undefined ) {

		_renderer = null;

		if ( typeof navigator !== 'undefined' && navigator.gpu !== undefined ) {

			const renderer = new WebGPURenderer( { antialias: false } );
			await renderer.init();

			if ( renderer.backend.isWebGPUBackend === true ) _renderer = renderer;

		}

	}

	return _renderer;

}

function rawComputeTest( name, options, run ) {

	QUnit.test( name, async ( assert ) => {

		const renderer = await getRenderer();

		if ( renderer === null ) {

			assert.ok( true, 'SKIPPED: WebGPU is not available in this environment.' );
			return;

		}

		await run( { assert, renderer } );

	} );

}

async function readFloats( renderer, attribute ) {

	return new Float32Array( await renderer.getArrayBufferAsync( attribute ) );

}

export default QUnit.module( 'Renderers', () => {

	QUnit.module( 'Common', () => {

		QUnit.module( 'StorageBufferAttribute', () => {

			// CPU-side data

			QUnit.test( 'an attribute created from a count allocates its array on first access', ( assert ) => {

				const attribute = new StorageBufferAttribute( 8, 4 );

				assert.strictEqual( attribute.hasCPUData, false, 'no CPU data before the array is accessed' );
				assert.strictEqual( attribute.count, 8, 'count' );
				assert.strictEqual( attribute.itemSize, 4, 'itemSize' );
				assert.strictEqual( attribute.arrayType, Float32Array, 'arrayType' );

				const array = attribute.array;

				assert.ok( array instanceof Float32Array, 'array type' );
				assert.strictEqual( array.length, 32, 'array length' );
				assert.ok( array.every( ( value ) => value === 0 ), 'array is zero-filled' );
				assert.strictEqual( attribute.hasCPUData, true, 'CPU data after the array is accessed' );
				assert.strictEqual( attribute.array, array, 'the same array is returned afterwards' );

			} );

			QUnit.test( 'an attribute created from a typed array holds CPU data', ( assert ) => {

				const array = new Uint32Array( 6 );
				const attribute = new StorageInstancedBufferAttribute( array, 2 );

				assert.strictEqual( attribute.hasCPUData, true, 'CPU data' );
				assert.strictEqual( attribute.array, array, 'array identity' );
				assert.strictEqual( attribute.count, 3, 'count' );
				assert.strictEqual( attribute.arrayType, Uint32Array, 'arrayType' );

			} );

			QUnit.test( 'typeClass defines the type of the array', ( assert ) => {

				const attribute = new StorageInstancedBufferAttribute( 5, 1, Int32Array );

				assert.strictEqual( attribute.arrayType, Int32Array, 'arrayType' );
				assert.strictEqual( attribute.hasCPUData, false, 'no CPU data' );
				assert.ok( attribute.array instanceof Int32Array, 'array type' );

				const indirect = new IndirectStorageBufferAttribute( 2, 4 );

				assert.strictEqual( indirect.arrayType, Uint32Array, 'indirect arrayType' );
				assert.strictEqual( indirect.hasCPUData, false, 'indirect without CPU data' );

			} );

			QUnit.test( 'setting the array to null releases the CPU data', ( assert ) => {

				const attribute = new StorageBufferAttribute( new Float32Array( 4 ), 1 );

				attribute.array = null;

				assert.strictEqual( attribute.hasCPUData, false, 'no CPU data' );
				assert.strictEqual( attribute.arrayType, Float32Array, 'arrayType is kept' );

			} );

			QUnit.test( 'the array type follows the assigned array', ( assert ) => {

				for ( const AttributeClass of [ StorageBufferAttribute, StorageInstancedBufferAttribute ] ) {

					const attribute = new AttributeClass( 4, 1 );

					attribute.array = new Uint32Array( 4 );

					assert.strictEqual( attribute.arrayType, Uint32Array, `${ AttributeClass.name }: arrayType after replacing the array` );

					attribute.array = null;

					assert.strictEqual( attribute.arrayType, Uint32Array, `${ AttributeClass.name }: arrayType after releasing the array` );
					assert.ok( attribute.array instanceof Uint32Array, `${ AttributeClass.name }: the array is allocated again with the last type` );

				}

			} );

			QUnit.test( 'copy() keeps the array type of the source', ( assert ) => {

				for ( const AttributeClass of [ StorageBufferAttribute, StorageInstancedBufferAttribute ] ) {

					const source = new AttributeClass( new Uint32Array( [ 1, 2, 3, 4 ] ), 1 );
					const attribute = new AttributeClass( 4, 1 ).copy( source );

					attribute.array = null;

					assert.strictEqual( attribute.arrayType, Uint32Array, `${ AttributeClass.name }: arrayType` );
					assert.deepEqual( attribute.array, new Uint32Array( 4 ), `${ AttributeClass.name }: a released array is allocated again zero-filled` );

				}

			} );

			// GPU

			rawComputeTest( 'compute writes into a storage buffer without CPU data are read back', {}, async ( { assert, renderer } ) => {

				const count = 64;
				const buffer = instancedArray( count, 'vec4' );

				await renderer.computeAsync( Fn( () => {

					const i = float( instanceIndex );
					buffer.element( instanceIndex ).assign( vec4( i, i.mul( 2 ), i.mul( 3 ), i.mul( 4 ) ) );

				} )().compute( count ) );

				const result = await readFloats( renderer, buffer.value );

				assert.strictEqual( buffer.value.hasCPUData, false, 'no CPU array was allocated' );
				assert.strictEqual( result.length, count * 4, 'buffer length' );

				let ok = true;
				for ( let i = 0; i < count; i ++ ) {

					ok = ok && result[ i * 4 ] === i && result[ i * 4 + 1 ] === i * 2 && result[ i * 4 + 2 ] === i * 3 && result[ i * 4 + 3 ] === i * 4;

				}

				assert.ok( ok, 'values' );

			} );

			rawComputeTest( 'a storage buffer without CPU data starts zero-initialized', {}, async ( { assert, renderer } ) => {

				const count = 32;
				const buffer = instancedArray( count, 'vec4' );

				await renderer.computeAsync( Fn( () => {

					buffer.element( instanceIndex ).addAssign( vec4( 1 ) );

				} )().compute( count ) );

				const result = await readFloats( renderer, buffer.value );

				assert.strictEqual( result.length, count * 4, 'buffer length' );
				assert.ok( result.every( ( value ) => value === 1 ), 'every component is 0 + 1' );
				assert.strictEqual( buffer.value.hasCPUData, false, 'no CPU array was allocated' );

			} );

			rawComputeTest( 'data written into the array before first use are uploaded', {}, async ( { assert, renderer } ) => {

				const count = 16;
				const buffer = instancedArray( count, 'float' );

				for ( let i = 0; i < count; i ++ ) buffer.value.array[ i ] = i + 0.5;

				await renderer.computeAsync( Fn( () => {

					buffer.element( instanceIndex ).mulAssign( 2 );

				} )().compute( count ) );

				const result = await readFloats( renderer, buffer.value );

				assert.deepEqual( Array.from( result ), Array.from( { length: count }, ( v, i ) => ( i + 0.5 ) * 2 ), 'values' );

			} );

			rawComputeTest( 'a vec3 storage buffer without CPU data is padded to vec4', {}, async ( { assert, renderer } ) => {

				const count = 4;
				const buffer = instancedArray( count, 'vec3' );

				await renderer.computeAsync( Fn( () => {

					const i = float( instanceIndex );
					buffer.element( instanceIndex ).assign( vec3( i, i.add( 1 ), i.add( 2 ) ) );

				} )().compute( count ) );

				const result = await readFloats( renderer, buffer.value );

				assert.strictEqual( buffer.value.itemSize, 4, 'itemSize is padded' );
				assert.strictEqual( buffer.value.hasCPUData, false, 'no CPU array was allocated' );
				assert.deepEqual( [ result[ 4 ], result[ 5 ], result[ 6 ] ], [ 1, 2, 3 ], 'values use the padded layout' );
				assert.strictEqual( result.length, count * 4, 'buffer length' );

			} );

			rawComputeTest( 'a struct array without CPU data', {}, async ( { assert, renderer } ) => {

				const Item = struct( { a: 'vec4', b: 'vec4' } );
				const count = 8;
				const buffer = instancedArray( count, Item );

				await renderer.computeAsync( Fn( () => {

					const i = float( instanceIndex );
					const item = buffer.element( instanceIndex );
					item.get( 'a' ).assign( vec4( i ) );
					item.get( 'b' ).assign( vec4( i.mul( 2 ) ) );

				} )().compute( count ) );

				const result = await readFloats( renderer, buffer.value );

				assert.strictEqual( buffer.value.hasCPUData, false, 'no CPU array was allocated' );
				assert.strictEqual( result.length, count * 8, 'buffer length' );
				assert.deepEqual( Array.from( result.subarray( 24, 32 ) ), [ 3, 3, 3, 3, 6, 6, 6, 6 ], 'values of item 3' );

			} );

			rawComputeTest( 'renderer.info reports the size of storage buffers without CPU data', {}, async ( { assert, renderer } ) => {

				const before = renderer.info.memory.storageAttributesSize;
				const buffer = instancedArray( 100, 'vec4' );

				await renderer.computeAsync( Fn( () => {

					buffer.element( instanceIndex ).assign( vec4( 1 ) );

				} )().compute( 100 ) );

				assert.strictEqual( renderer.info.memory.storageAttributesSize - before, 100 * 16, 'storage attributes size' );
				assert.strictEqual( buffer.value.hasCPUData, false, 'no CPU array was allocated' );

				buffer.value.dispose();

				assert.strictEqual( renderer.info.memory.storageAttributesSize, before, 'size after dispose' );

			} );

			rawComputeTest( 'dispose() destroys the GPU buffer of a storage buffer without CPU data', {}, async ( { assert, renderer } ) => {

				const buffer = instancedArray( 8, 'float' );

				await renderer.computeAsync( Fn( () => {

					buffer.element( instanceIndex ).assign( 1 );

				} )().compute( 8 ) );

				const destroy = GPUBuffer.prototype.destroy;
				const destroyed = [];

				GPUBuffer.prototype.destroy = function () {

					destroyed.push( this );
					return destroy.call( this );

				};

				try {

					buffer.value.dispose();

				} finally {

					GPUBuffer.prototype.destroy = destroy;

				}

				assert.strictEqual( destroyed.length, 1, 'one GPU buffer was destroyed' );
				assert.strictEqual( destroyed[ 0 ].size, 8 * 4, 'the destroyed buffer is the storage buffer' );
				assert.strictEqual( buffer.value.hasCPUData, false, 'no CPU array was allocated' );

			} );

			rawComputeTest( 'the widened type of an uploaded array is kept when the array is released', {}, async ( { assert, renderer } ) => {

				const attribute = new StorageBufferAttribute( new Uint16Array( [ 1, 2, 3, 4 ] ), 1 );
				const buffer = storage( attribute, 'uint', 4 );

				await renderer.computeAsync( Fn( () => {

					buffer.element( instanceIndex ).mulAssign( uint( 2 ) );

				} )().compute( 4 ) );

				const result = new Uint32Array( await renderer.getArrayBufferAsync( attribute ) );

				assert.deepEqual( Array.from( result ), [ 2, 4, 6, 8 ], 'values' );
				assert.strictEqual( attribute.arrayType, Uint32Array, 'the uploaded array was widened to 32 bit' );

				attribute.array = null;

				assert.strictEqual( attribute.arrayType, Uint32Array, 'arrayType after releasing the array' );

			} );

			rawComputeTest( 'updates of padded vec3 storage data are uploaded unchanged', {}, async ( { assert, renderer } ) => {

				const buffer = instancedArray( new Float32Array( [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ] ), 'vec3' );
				const output = instancedArray( 3, 'vec4' );

				const copy = Fn( () => {

					output.element( instanceIndex ).assign( vec4( buffer.element( instanceIndex ), 1 ) );

				} )().compute( 3 );

				await renderer.computeAsync( copy );

				// the attribute now holds the padded layout

				const array = buffer.value.array;

				assert.strictEqual( buffer.value.itemSize, 4, 'itemSize is padded' );
				assert.deepEqual( Array.from( array ), [ 1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0 ], 'padded array' );

				array.set( [ 40, 50, 60 ], 4 );
				buffer.value.needsUpdate = true;

				await renderer.computeAsync( copy );

				const result = await readFloats( renderer, output.value );

				assert.deepEqual( Array.from( result ), [ 1, 2, 3, 1, 40, 50, 60, 1, 7, 8, 9, 1 ], 'updated values' );

				// update ranges address the padded layout as well

				array.set( [ 70, 80, 90 ], 8 );
				buffer.value.addUpdateRange( 8, 3 );
				buffer.value.needsUpdate = true;

				await renderer.computeAsync( copy );

				const rangeResult = await readFloats( renderer, output.value );

				assert.deepEqual( Array.from( rangeResult ), [ 1, 2, 3, 1, 40, 50, 60, 1, 70, 80, 90, 1 ], 'values updated through an update range' );

			} );

			rawComputeTest( 'a failed readback releases its buffers', {}, async ( { assert, renderer } ) => {

				const buffer = instancedArray( 4, 'float' );

				await renderer.computeAsync( Fn( () => {

					buffer.element( instanceIndex ).assign( 7 );

				} )().compute( 4 ) );

				const mapAsync = GPUBuffer.prototype.mapAsync;
				const destroy = GPUBuffer.prototype.destroy;
				const destroyed = new Set();
				const failure = new Error( 'mapping failed' );
				const errors = [];

				GPUBuffer.prototype.mapAsync = function () {

					return Promise.reject( failure );

				};

				GPUBuffer.prototype.destroy = function () {

					destroyed.add( this );
					return destroy.call( this );

				};

				const target = new ReadbackBuffer( 16 );

				try {

					try {

						await renderer.getArrayBufferAsync( buffer.value ).catch( ( error ) => errors.push( error ) );
						await renderer.getArrayBufferAsync( buffer.value, target ).catch( ( error ) => errors.push( error ) );

					} finally {

						GPUBuffer.prototype.mapAsync = mapAsync;
						GPUBuffer.prototype.destroy = destroy;

					}

					assert.strictEqual( errors.length, 2, 'both readbacks failed' );
					assert.strictEqual( errors[ 0 ], failure, 'a readback into a new array buffer rethrows the mapping error' );
					assert.strictEqual( errors[ 1 ], failure, 'a readback into a ReadbackBuffer rethrows the mapping error' );
					assert.strictEqual( destroyed.size, 1, 'the temporary read buffer was destroyed' );

					await renderer.getArrayBufferAsync( buffer.value, target );

					assert.deepEqual( Array.from( new Float32Array( target.buffer ) ), [ 7, 7, 7, 7 ], 'the readback buffer can be used again' );

					target.release();

				} finally {

					target.dispose();

				}

			} );

		} );

	} );

} );
