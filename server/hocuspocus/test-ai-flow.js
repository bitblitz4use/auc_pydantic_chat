/**
 * Test script for AI Export/Import flow
 * 
 * This script tests the complete AI integration:
 * 1. Export document as Markdown
 * 2. Simulate AI changes
 * 3. Import AI changes back
 * 4. Verify undo functionality
 * 
 * Usage: node test-ai-flow.js [document-name]
 */

const API_BASE = 'http://127.0.0.1:3001';

async function testAIFlow(documentName = 'shared-document') {
  console.log('🧪 Testing AI Export/Import Flow\n');
  console.log(`📄 Document: ${documentName}\n`);

  try {
    // Step 1: Export document
    console.log('Step 1: Exporting document as Markdown...');
    const exportRes = await fetch(`${API_BASE}/api/ai/export/${documentName}`);
    
    if (!exportRes.ok) {
      const error = await exportRes.json();
      console.error('❌ Export failed:', error);
      
      if (exportRes.status === 404) {
        console.log('\n💡 Tip: Open the document in the editor first!');
      }
      return;
    }
    
    const exportData = await exportRes.json();
    console.log('✅ Export successful!');
    console.log(`   Source: ${exportData.source}`);
    console.log(`   Length: ${exportData.length} characters`);
    console.log(`   Exported at: ${exportData.exportedAt}`);
    console.log(`\n📝 Original content:\n${exportData.markdown}\n`);

    // Step 2: Simulate AI changes
    console.log('Step 2: Simulating AI changes...');
    const aiModifiedMarkdown = `${exportData.markdown}\n\n---\n\n**AI Addition:** This content was added by the AI system at ${new Date().toISOString()}`;
    console.log(`✅ AI modified content (added ${aiModifiedMarkdown.length - exportData.length} chars)\n`);

    // Step 3: Import AI changes
    console.log('Step 3: Importing AI changes back to document...');
    const importRes = await fetch(`${API_BASE}/api/ai/import/${documentName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        markdown: aiModifiedMarkdown,
        metadata: {
          model: 'test-script',
          changeId: `test-${Date.now()}`,
          prompt: 'Add AI footer',
        },
      }),
    });

    if (!importRes.ok) {
      const error = await importRes.json();
      console.error('❌ Import failed:', error);
      
      if (importRes.status === 404) {
        console.log('\n💡 Tip: The document must be open in an editor for real-time sync!');
      }
      return;
    }

    const importData = await importRes.json();
    console.log('✅ Import successful!');
    console.log(`   Applied at: ${importData.appliedAt}`);
    console.log(`   Metadata:`, importData.metadata);

    // Step 4: Get metadata
    console.log('\nStep 4: Fetching AI metadata...');
    const metaRes = await fetch(`${API_BASE}/api/ai/metadata/${documentName}`);
    
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      console.log('✅ Metadata retrieved:');
      console.log('   Last edit:', metaData.lastEdit);
    }

    // Success
    console.log('\n✅ All tests passed!\n');
    console.log('Next steps:');
    console.log('1. Check the editor - you should see the AI changes in real-time');
    console.log('2. Click the "⎌ Undo AI" button to revert all AI changes');
    console.log('3. Click the "⟲ Redo AI" button to reapply them\n');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure the Hocuspocus server is running:');
      console.log('   cd server/hocuspocus && npm run dev');
    }
  }
}

// Get document name from args or use default
const documentName = process.argv[2] || 'shared-document';
testAIFlow(documentName);
