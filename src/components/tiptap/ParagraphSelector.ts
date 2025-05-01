import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Node } from '@tiptap/pm/model';

// Define the type for the extension options
export interface ParagraphSelectorOptions {
  // Callback to notify React component when selection state in storage changes
  onSelectionStorageChange: (indices: Set<number>) => void;
  // Styling classes can be added later if needed
}

// Create a PluginKey - use the extension name for uniqueness
const paragraphSelectorPluginKey = new PluginKey('paragraphSelector');

// Helper function to calculate decorations based on doc and selected indices
function calculateDecorations(doc: Node, selectedIndices: Set<number>): Decoration[] {
    const decorations: Decoration[] = [];
    let paragraphIndex = 0;
    doc.forEach((node: Node, pos: number) => {
        // Check if the node is a paragraph (adjust if using different node types)
        if (node.type.name === 'paragraph') {
            const isSelected = selectedIndices.has(paragraphIndex);

            // --- Add Widget Decoration for the Dot ---
            const dot = document.createElement('span');
            // Use inline styles for reliable positioning relative to the paragraph start
            dot.style.position = 'absolute';
            dot.style.left = '-1.5em'; // Position left of the paragraph
            dot.style.top = '0.3em'; // Adjust vertical alignment
            dot.style.width = '0.6rem';
            dot.style.height = '0.6rem';
            dot.style.borderRadius = '9999px';
            dot.style.cursor = 'pointer';
            dot.style.transition = 'background-color 0.2s';
            dot.style.backgroundColor = isSelected ? 'rgb(59 130 246)' : 'rgb(209 213 219)'; // Blue-500 or Gray-300
            // Basic hover effect (only changes color, not using Tailwind class for simplicity here)
            dot.onmouseenter = () => { if (!isSelected) dot.style.backgroundColor = 'rgb(156 163 175)'; }; // Gray-400
            dot.onmouseleave = () => { if (!isSelected) dot.style.backgroundColor = 'rgb(209 213 219)'; }; // Gray-300

            dot.title = 'Click to select/deselect paragraph for context';
            dot.dataset.paragraphIndex = String(paragraphIndex); // Store index for handlers

            // Add widget decoration before the paragraph content
            decorations.push(Decoration.widget(
                pos + 1, // Position inside the paragraph node, at the start
                dot,
                { side: -1, key: `dot-${paragraphIndex}` } // side: -1 biases towards the start
            ));

            // --- Add Node Decoration for Background Highlight ---
            if (isSelected) {
                decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                    class: 'bg-blue-100/50 paragraph-selected', // Apply selection background
                    key: `bg-${paragraphIndex}`
                }));
            }
            // Note: Decorations are completely recalculated, so no need to explicitly remove the class

            paragraphIndex++;
        }
    });
    return decorations;
}


export const ParagraphSelector = Extension.create<ParagraphSelectorOptions>({
  name: 'paragraphSelector',

  addOptions() {
    return {
      // Default no-op function for the new callback
      onSelectionStorageChange: () => {},
    };
  },

  // Use editor storage to keep track of the selection state
  addStorage() {
    return {
      selectedIndices: new Set<number>(),
    };
  },

  addProseMirrorPlugins() {
    const extensionThis = this; // Reference to the extension instance for use inside plugin

    return [
      new Plugin({
        key: paragraphSelectorPluginKey,
        state: {
          // Initialize plugin state (the DecorationSet)
          init(_, state) { // state is editor state
            // Calculate initial decorations based on storage (which should be default empty set initially)
            return DecorationSet.create(state.doc, calculateDecorations(state.doc, extensionThis.storage.selectedIndices));
          },
          // Apply transactions to the plugin state
          apply(tr, oldSet, oldState, newState) {
            // Check if our specific metadata is present OR if the document structure changed
            const updateReason = tr.getMeta(paragraphSelectorPluginKey);
            const selectionUpdated = updateReason?.type === 'SELECTION_UPDATED';
            const needsRecalculation = selectionUpdated || tr.docChanged;

            // Map existing decorations first only if the doc changed but selection didn't
            let set = (tr.docChanged && !selectionUpdated) ? oldSet.map(tr.mapping, tr.doc) : oldSet;

            if (needsRecalculation) {
               // Recalculate decorations using the current doc and indices from storage
               set = DecorationSet.create(newState.doc, calculateDecorations(newState.doc, extensionThis.storage.selectedIndices));

               // If the selection was explicitly updated, notify the React component
               if (selectionUpdated) {
                    // Call the callback provided in options to update the React state
                    extensionThis.options.onSelectionStorageChange(extensionThis.storage.selectedIndices as Set<number>);
               }
            }

            return set;
          },
        },
        props: {
          // Provide the decorations to the editor view
          decorations(state) {
            // Return the DecorationSet managed by this plugin's state
            return this.getState(state);
          },
          // Handle clicks directly on the editor view
          handleDOMEvents: {
            mousedown: (view, event) => {
                const target = event.target as HTMLElement;
                // Find the closest element with paragraph-index data attribute (our dot)
                const dotElement = target.closest<HTMLElement>('[data-paragraph-index]');

                if (dotElement && dotElement.dataset.paragraphIndex !== undefined) {
                    // We clicked a dot!
                    event.preventDefault(); // Prevent default text selection/cursor movement
                    event.stopPropagation(); // Stop the event bubbling up

                    const index = parseInt(dotElement.dataset.paragraphIndex, 10);

                    if (!isNaN(index)) {
                        // Get the current selection directly from storage
                        const currentIndices = new Set(extensionThis.storage.selectedIndices as Set<number>);

                        // Toggle the index
                        if (currentIndices.has(index)) {
                            currentIndices.delete(index);
                        } else {
                            currentIndices.add(index);
                        }

                        // 1. Update the storage directly
                        extensionThis.storage.selectedIndices = currentIndices;

                        // 2. Dispatch a transaction with metadata to trigger the plugin's 'apply' method
                        // This will handle decoration updates AND calling the notification callback
                        const tr = view.state.tr.setMeta(paragraphSelectorPluginKey, { type: 'SELECTION_UPDATED' });
                        view.dispatch(tr);

                        // REMOVED: Direct call to React state setter (this.options.setSelectedIndices)

                        return true; // Indicate that we handled this event
                    }
                }
                // If we didn't click a dot, let other handlers (or default behavior) proceed
                return false;
            },
            // We might add mousemove/mouseup later for drag selection
          },
        },
      }),
    ];
  },
}); 