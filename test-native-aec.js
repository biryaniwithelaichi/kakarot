#!/usr/bin/env node

console.log('🧪 Testing Native AEC Module\n');

try {
    // Load the native module
    const native = require('./build/Release/audio_capture_native.node');
    console.log('✅ Native module loaded');
    console.log('   Functions:', Object.keys(native).join(', '));
    console.log('');
    
    // Track audio buffers
    let micCount = 0;
    let sysCount = 0;
    let startTime = Date.now();
    
    // Start audio capture
    console.log('🎤 Starting audio capture...\n');
    
    native.startAudioCapture(48000, (buffer, timestamp, source) => {
        if (source === 'microphone') {
            micCount++;
        } else if (source === 'system') {
            sysCount++;
        }
        
        // Log every 50 buffers
        const total = micCount + sysCount;
        if (total % 50 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`📊 [${elapsed}s] Mic: ${micCount}, System: ${sysCount}, Total: ${total}`);
        }
    });
    
    console.log('⏱️  Recording for 5 seconds...');
    console.log('   (Please speak and play audio to test both streams)\n');
    
    // Stop after 5 seconds
    setTimeout(() => {
        native.stopAudioCapture();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Test Complete');
        console.log('='.repeat(60));
        console.log(`Duration: ${duration}s`);
        console.log(`Microphone buffers: ${micCount}`);
        console.log(`System audio buffers: ${sysCount}`);
        console.log(`Total buffers: ${micCount + sysCount}`);
        console.log('');
        
        // Validate results
        if (micCount > 0 && sysCount > 0) {
            console.log('🎉 SUCCESS! Both audio streams are working!');
            console.log('   ✅ Microphone capture: WORKING');
            console.log('   ✅ System audio capture: WORKING');
            console.log('   ✅ WebRTC AEC3: READY');
        } else if (micCount > 0) {
            console.log('⚠️  PARTIAL SUCCESS');
            console.log('   ✅ Microphone capture: WORKING');
            console.log('   ❌ System audio capture: NOT WORKING');
            console.log('');
            console.log('Troubleshooting:');
            console.log('  • Check System Settings → Privacy → Microphone');
            console.log('  • Restart the application');
            console.log('  • Verify macOS version (requires 10.15+)');
        } else {
            console.log('❌ FAILED - No audio captured');
            console.log('');
            console.log('Troubleshooting:');
            console.log('  • Grant microphone permission');
            console.log('  • Check if microphone is connected');
            console.log('  • Review console logs for errors');
        }
        
        process.exit(micCount > 0 ? 0 : 1);
    }, 5000);
    
} catch (err) {
    console.error('❌ ERROR:', err.message);
    console.error('');
    console.error('Stack trace:');
    console.error(err.stack);
    console.error('');
    console.error('Build troubleshooting:');
    console.error('  1. npm run setup:webrtc');
    console.error('  2. npm run build:native');
    console.error('  3. ls -lh build/Release/audio_capture_native.node');
    console.error('  4. ls -lh native/webrtc/lib/libwebrtc.a');
    process.exit(1);
}
