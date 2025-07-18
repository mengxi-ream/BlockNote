import {
  addInlineContentAttributes,
  addInlineContentKeyboardShortcuts,
  camelToDataKebab,
  createInternalInlineContentSpec,
  createStronglyTypedTiptapNode,
  CustomInlineContentConfig,
  getInlineContentParseRules,
  InlineContentFromConfig,
  inlineContentToNodes,
  nodeToCustomInlineContent,
  PartialCustomInlineContentFromConfig,
  Props,
  PropSchema,
  propsToAttributes,
  StyleSchema,
  BlockNoteEditor,
  InlineContentSchemaWithInlineContent,
} from "@blocknote/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useReactNodeView,
} from "@tiptap/react";
// import { useReactNodeView } from "@tiptap/react/dist/packages/react/src/useReactNodeView";
import { FC, JSX } from "react";
import { renderToDOMSpec } from "./@util/ReactRenderUtil.js";
// this file is mostly analogoues to `customBlocks.ts`, but for React blocks

export type ReactCustomInlineContentRenderProps<
  T extends CustomInlineContentConfig,
  S extends StyleSchema,
> = {
  inlineContent: InlineContentFromConfig<T, S>;
  updateInlineContent: (
    update: PartialCustomInlineContentFromConfig<T, S>,
  ) => void;
  editor: BlockNoteEditor<
    any,
    InlineContentSchemaWithInlineContent<T["type"], T>,
    S
  >;
  contentRef: (node: HTMLElement | null) => void;
};

// extend BlockConfig but use a React render function
export type ReactInlineContentImplementation<
  T extends CustomInlineContentConfig,
  // I extends InlineContentSchema,
  S extends StyleSchema,
> = {
  render: FC<ReactCustomInlineContentRenderProps<T, S>>;
  // TODO?
  // toExternalHTML?: FC<{
  //   block: BlockFromConfig<T, I, S>;
  //   editor: BlockNoteEditor<BlockSchemaWithBlock<T["type"], T>, I, S>;
  // }>;
};

// Function that adds a wrapper with necessary classes and attributes to the
// component returned from a custom inline content's 'render' function, to
// ensure no data is lost on internal copy & paste.
export function InlineContentWrapper<
  IType extends string,
  PSchema extends PropSchema,
>(props: {
  children: JSX.Element;
  inlineContentType: IType;
  inlineContentProps: Props<PSchema>;
  propSchema: PSchema;
}) {
  return (
    // Creates inline content section element
    <NodeViewWrapper
      as={"span"}
      // Sets inline content section class
      className={"bn-inline-content-section"}
      // Sets content type attribute
      data-inline-content-type={props.inlineContentType}
      // Adds props as HTML attributes in kebab-case with "data-" prefix. Skips
      // props set to their default values.
      {...Object.fromEntries(
        Object.entries(props.inlineContentProps)
          .filter(([prop, value]) => {
            const spec = props.propSchema[prop];
            return value !== spec.default;
          })
          .map(([prop, value]) => {
            return [camelToDataKebab(prop), value];
          }),
      )}
    >
      {props.children}
    </NodeViewWrapper>
  );
}

// A function to create custom block for API consumers
// we want to hide the tiptap node from API consumers and provide a simpler API surface instead
export function createReactInlineContentSpec<
  T extends CustomInlineContentConfig,
  // I extends InlineContentSchema,
  S extends StyleSchema,
>(
  inlineContentConfig: T,
  inlineContentImplementation: ReactInlineContentImplementation<T, S>,
) {
  const node = createStronglyTypedTiptapNode({
    name: inlineContentConfig.type as T["type"],
    inline: true,
    group: "inline",
    selectable: inlineContentConfig.content === "styled",
    atom: inlineContentConfig.content === "none",
    draggable: inlineContentConfig.draggable,
    content: (inlineContentConfig.content === "styled"
      ? "inline*"
      : "") as T["content"] extends "styled" ? "inline*" : "",

    addAttributes() {
      return propsToAttributes(inlineContentConfig.propSchema);
    },

    addKeyboardShortcuts() {
      return addInlineContentKeyboardShortcuts(inlineContentConfig);
    },

    parseHTML() {
      return getInlineContentParseRules(inlineContentConfig);
    },

    renderHTML({ node }) {
      const editor = this.options.editor;

      const ic = nodeToCustomInlineContent(
        node,
        editor.schema.inlineContentSchema,
        editor.schema.styleSchema,
      ) as any as InlineContentFromConfig<T, S>; // TODO: fix cast
      const Content = inlineContentImplementation.render;
      const output = renderToDOMSpec(
        (refCB) => (
          <Content
            inlineContent={ic}
            updateInlineContent={() => {
              // No-op
            }}
            editor={editor}
            contentRef={refCB}
          />
        ),
        editor,
      );

      return addInlineContentAttributes(
        output,
        inlineContentConfig.type,
        node.attrs as Props<T["propSchema"]>,
        inlineContentConfig.propSchema,
      );
    },

    // TODO: needed?
    addNodeView() {
      const editor: BlockNoteEditor<any, any, any> = this.options.editor;
      return (props) =>
        ReactNodeViewRenderer(
          (props: NodeViewProps) => {
            const ref = useReactNodeView().nodeViewContentRef;

            if (!ref) {
              throw new Error("nodeViewContentRef is not set");
            }

            const Content = inlineContentImplementation.render;
            return (
              <InlineContentWrapper
                inlineContentProps={props.node.attrs as Props<T["propSchema"]>}
                inlineContentType={inlineContentConfig.type}
                propSchema={inlineContentConfig.propSchema}
              >
                <Content
                  contentRef={ref}
                  editor={editor}
                  inlineContent={
                    nodeToCustomInlineContent(
                      props.node,
                      editor.schema.inlineContentSchema,
                      editor.schema.styleSchema,
                    ) as any as InlineContentFromConfig<T, S> // TODO: fix cast
                  }
                  updateInlineContent={(update) => {
                    const content = inlineContentToNodes(
                      [update],
                      editor.pmSchema,
                    );

                    editor.transact((tr) =>
                      tr.replaceWith(
                        props.getPos(),
                        props.getPos() + props.node.nodeSize,
                        content,
                      ),
                    );
                  }}
                />
              </InlineContentWrapper>
            );
          },
          {
            className: "bn-ic-react-node-view-renderer",
            as: "span",
            // contentDOMElementTag: "span", (requires tt upgrade)
          },
        )(props);
    },
  });

  return createInternalInlineContentSpec(inlineContentConfig, {
    node: node,
  } as any);
}
