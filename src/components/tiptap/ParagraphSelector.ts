import { Extension, RawCommands, AnyCommands } from '@tiptap/core';
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
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

            // --- Add Widget Decoration for the Vertical Bar ---
            const bar = document.createElement('span');
            bar.style.position = 'absolute';
            bar.style.left = '-1em';
            bar.style.top = '0';
            bar.style.width = '3px';
            bar.style.height = '100%';
            bar.style.cursor = 'pointer';
            bar.style.transition = 'background-color 0.2s';
            bar.style.backgroundColor = isSelected ? 'rgb(59 130 246)' : 'rgb(209 213 219)';
            bar.onmouseenter = () => { if (!isSelected) bar.style.backgroundColor = 'rgb(156 163 175)'; };
            bar.onmouseleave = () => { if (!isSelected) bar.style.backgroundColor = 'rgb(209 213 219)'; };
            bar.title = 'Click to select/deselect paragraph for context';
            bar.dataset.paragraphIndex = String(paragraphIndex);

            decorations.push(Decoration.widget(
                pos + 1, // Position inside the paragraph node, at the start
                bar,
                { side: -1, key: `bar-${paragraphIndex}` }
            ));

            // --- Add Node Decoration for Background Highlight and Positioning ---
            const nodeAttrs: { style: string, class?: string } = {
                // Always apply relative positioning for the absolute bar height
                style: 'position: relative;'
            };
            if (isSelected) {
                // Add background class only if selected
                nodeAttrs.class = 'bg-blue-100/50 paragraph-selected';
            }

            decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                ...nodeAttrs,
                key: `node-style-${paragraphIndex}` // Unique key for this combined decoration
            }));

            paragraphIndex++;
        }
    });
    return decorations;
}

// Extend the global Commands interface to include our new command
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphSelector: {
      /**
       * Clears the paragraph selection state.
       */
      clearParagraphSelection: () => ReturnType;
    }
  }
}

export const ParagraphSelector = Extension.create<ParagraphSelectorOptions>({
  name: 'paragraphSelector',

  addOptions() {
    return {
      // Default no-op function for the new callback
      onSelectionStorageChange: () => {},
    };
  },

  addCommands() {
    return {
      clearParagraphSelection: () => ({ tr, dispatch }: { tr: Transaction, dispatch?: (tr: Transaction) => void }) => {
        // Reset the storage in the extension instance
        if (this.storage) {
            this.storage.selectedIndices = new Set<number>();
        }

        // Dispatch a transaction with metadata to notify the plugin state to update
        if (dispatch) {
          // Use the existing plugin key for the metadata
          dispatch(tr.setMeta(paragraphSelectorPluginKey, { type: 'SELECTION_UPDATED' }));
        }
        // Return true to indicate the command successfully ran
        return true;
      },
    } as Partial<RawCommands>;
  },

  // Use editor storage to keep track of the selection state
  addStorage() {
    return {
      selectedIndices: new Set<number>(),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: paragraphSelectorPluginKey,
        state: {
          // Use arrow function for init
          init: (_, state) => { // state is editor state
            // Calculate initial decorations based on storage (which should be default empty set initially)
            return DecorationSet.create(state.doc, calculateDecorations(state.doc, this.storage.selectedIndices as Set<number>));
          },
          // Use arrow function for apply
          apply: (tr, oldSet, oldState, newState) => {
            // Check if our specific metadata is present OR if the document structure changed
            const updateReason = tr.getMeta(paragraphSelectorPluginKey);
            const selectionUpdated = updateReason?.type === 'SELECTION_UPDATED';
            const needsRecalculation = selectionUpdated || tr.docChanged;

            // Map existing decorations first only if the doc changed but selection didn't
            let set = (tr.docChanged && !selectionUpdated) ? oldSet.map(tr.mapping, tr.doc) : oldSet;

            if (needsRecalculation) {
               // Recalculate decorations using the current doc and indices from storage
               set = DecorationSet.create(newState.doc, calculateDecorations(newState.doc, this.storage.selectedIndices as Set<number>));

               // If the selection was explicitly updated, notify the React component
               if (selectionUpdated) {
                    this.options.onSelectionStorageChange(this.storage.selectedIndices as Set<number>);
               }
            }

            return set;
          },
        },
        props: {
          // Provide the decorations to the editor view
          decorations(state) { // 'this' here refers to the plugin props spec object, which is correct. No change needed.
            // Return the DecorationSet managed by this plugin's state
            return this.getState(state);
          },
          // Handle clicks directly on the editor view
          handleDOMEvents: {
            // Use arrow function for mousedown
            mousedown: (view: EditorView, event: MouseEvent) => {
                const target = event.target as HTMLElement;
                // Find the closest element with paragraph-index data attribute (our bar)
                const barElement = target.closest<HTMLElement>('[data-paragraph-index]');

                if (barElement && barElement.dataset.paragraphIndex !== undefined) {
                    // We clicked a bar!
                    event.preventDefault();
                    event.stopPropagation();

                    const index = parseInt(barElement.dataset.paragraphIndex, 10);

                    if (!isNaN(index)) {
                        // Get the current selection directly from storage using lexically scoped 'this'
                        const currentIndices = new Set(this.storage.selectedIndices as Set<number>); // Use 'this'

                        // Toggle the index
                        if (currentIndices.has(index)) {
                            currentIndices.delete(index);
                        } else {
                            currentIndices.add(index);
                        }

                        // 1. Update the storage directly using lexically scoped 'this'
                        this.storage.selectedIndices = currentIndices; // Use 'this'

                        // 2. Dispatch a transaction with metadata to trigger the plugin's 'apply' method
                        const tr = view.state.tr.setMeta(paragraphSelectorPluginKey, { type: 'SELECTION_UPDATED' }); // Use existing key
                        view.dispatch(tr);

                        return true; // Indicate that we handled this event
                    }
                }
                // If we didn't click a bar, let other handlers proceed
                return false;
            },
          },
        },
      }),
    ];
  },
}); 