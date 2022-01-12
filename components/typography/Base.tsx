import * as React from 'react';
import classNames from 'classnames';
import useMergedState from 'rc-util/lib/hooks/useMergedState';
import toArray from 'rc-util/lib/Children/toArray';
import copy from 'copy-to-clipboard';
import omit from 'rc-util/lib/omit';
import { composeRef } from 'rc-util/lib/ref';
import EditOutlined from '@ant-design/icons/EditOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import ResizeObserver from 'rc-resize-observer';
import { AutoSizeType } from 'rc-textarea/lib/ResizableTextArea';
import { ConfigConsumerProps, configConsumerProps, ConfigContext } from '../config-provider';
import { useLocaleReceiver } from '../locale-provider/LocaleReceiver';
import devWarning from '../_util/devWarning';
import TransButton from '../_util/transButton';
import raf from '../_util/raf';
import { isStyleSupport } from '../_util/styleChecker';
import Tooltip from '../tooltip';
import Typography, { TypographyProps } from './Typography';
import Editable from './Editable';
import measure from './util';
import Measure from './Measure';
import useMergedConfig from './hooks/useMergedConfig';
import useUpdatedEffect from './hooks/useUpdatedEffect';
import Ellipsis from './Ellipsis';

export type BaseType = 'secondary' | 'success' | 'warning' | 'danger';

const isLineClampSupport = isStyleSupport('webkitLineClamp');
const isTextOverflowSupport = isStyleSupport('textOverflow');

interface CopyConfig {
  text?: string;
  onCopy?: () => void;
  icon?: React.ReactNode;
  tooltips?: boolean | React.ReactNode;
}

interface EditConfig {
  editing?: boolean;
  icon?: React.ReactNode;
  tooltip?: boolean | React.ReactNode;
  onStart?: () => void;
  onChange?: (value: string) => void;
  onCancel?: () => void;
  onEnd?: () => void;
  maxLength?: number;
  autoSize?: boolean | AutoSizeType;
  triggerType?: ('icon' | 'text')[];
  enterIcon?: React.ReactNode;
}

export interface EllipsisConfig {
  rows?: number;
  expandable?: boolean;
  suffix?: string;
  symbol?: React.ReactNode;
  onExpand?: React.MouseEventHandler<HTMLElement>;
  onEllipsis?: (ellipsis: boolean) => void;
  tooltip?: React.ReactNode;
}

export interface BlockProps extends TypographyProps {
  title?: string;
  editable?: boolean | EditConfig;
  copyable?: boolean | CopyConfig;
  type?: BaseType;
  disabled?: boolean;
  ellipsis?: boolean | EllipsisConfig;
  // decorations
  code?: boolean;
  mark?: boolean;
  underline?: boolean;
  delete?: boolean;
  strong?: boolean;
  keyboard?: boolean;
  italic?: boolean;
}

function wrapperDecorations(
  { mark, code, underline, delete: del, strong, keyboard, italic }: BlockProps,
  content: React.ReactNode,
) {
  let currentContent = content;

  function wrap(needed: boolean | undefined, tag: string) {
    if (!needed) return;

    currentContent = React.createElement(tag, {}, currentContent);
  }

  wrap(strong, 'strong');
  wrap(underline, 'u');
  wrap(del, 'del');
  wrap(code, 'code');
  wrap(mark, 'mark');
  wrap(keyboard, 'kbd');
  wrap(italic, 'i');

  return currentContent;
}

function getNode(dom: React.ReactNode, defaultNode: React.ReactNode, needDom?: boolean) {
  if (dom === true || dom === undefined) {
    return defaultNode;
  }
  return dom || (needDom && defaultNode);
}

function toList<T>(val: T | T[]): T[] {
  return Array.isArray(val) ? val : [val];
}

interface InternalBlockProps extends BlockProps {
  component: string;
}

const ELLIPSIS_STR = '...';

const Base = (props: InternalBlockProps) => {
  const {
    prefixCls: customizePrefixCls,
    className,
    style,
    children,
    ellipsis,
    editable,
    copyable,
  } = props;
  const { getPrefixCls, direction } = React.useContext(ConfigContext);
  const textLocale = useLocaleReceiver('Text')[0]!; // Force TS get this

  const editIconRef = React.useRef<HTMLDivElement>(null);

  // ============================ MISC ============================
  const prefixCls = getPrefixCls('typography', customizePrefixCls);

  // ========================== Editable ==========================
  const [enableEdit, editConfig] = useMergedConfig<EditConfig>(editable);
  const [editing, setEditing] = useMergedState(false, {
    value: editConfig.editing,
  });

  const triggerEdit = (edit: boolean) => {
    if (edit) {
      editConfig.onStart?.();
    }

    setEditing(edit);
  };

  // Focus edit icon when back
  useUpdatedEffect(() => {
    if (!editing) {
      editIconRef.current?.focus();
    }
  }, [editing]);

  const onEditClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    triggerEdit(true);
  };

  const onEditChange = (value: string) => {
    editConfig.onChange?.(value);
    triggerEdit(false);
  };

  const onEditCancel = () => {
    editConfig.onCancel?.();
    triggerEdit(false);
  };

  // ========================== Copyable ==========================
  const [enableCopy, copyConfig] = useMergedConfig<CopyConfig>(copyable);
  const [copied, setCopied] = React.useState(false);
  const copyIdRef = React.useRef<NodeJS.Timeout>();

  const onCopyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (copyConfig.text === undefined) {
      copyConfig.text = String(children);
    }
    copy(copyConfig.text || '');

    setCopied(true);
    copyConfig.onCopy?.();
  };

  React.useEffect(() => {
    if (copied) {
      copyIdRef.current = setTimeout(() => {
        setCopied(false);
      }, 3000);
    }

    return clearTimeout(copyIdRef.current!);
  }, [copied]);

  // ========================== Ellipsis ==========================
  const [enableEllipsis, ellipsisConfig] = useMergedConfig<EllipsisConfig>(ellipsis, {
    rows: 1,
    expandable: false,
  });
  const [isEllipsis, setIsEllipsis] = React.useState(false);

  const cssEllipsis = React.useMemo(() => {
    if (
      // Disable ellipsis
      !enableEllipsis ||
      // Provide suffix
      ellipsisConfig.suffix !== undefined ||
      ellipsisConfig.onEllipsis ||
      // Can't use css ellipsis since we need to provide the place for button
      ellipsisConfig.expandable ||
      enableEdit ||
      enableCopy
    ) {
      return false;
    }

    if (ellipsisConfig.rows === 1) {
      return isTextOverflowSupport;
    }

    return isLineClampSupport;
  }, [
    enableEllipsis,
    enableEdit,
    enableCopy,
    ellipsisConfig,
    isTextOverflowSupport,
    isLineClampSupport,
  ]);

  // >>>>> Expand
  const [expanded, setExpanded] = React.useState(false);
  const onExpandClick: React.MouseEventHandler<HTMLElement> = e => {
    setExpanded(true);
    ellipsisConfig.onExpand?.(e);
  };

  // =========================== Render ===========================
  // >>>>>>>>>>> Editing input
  if (editConfig.editing) {
    return (
      <Editable
        value={typeof children === 'string' ? children : ''}
        onSave={onEditChange}
        onCancel={onEditCancel}
        onEnd={editConfig.onEnd}
        prefixCls={prefixCls}
        className={className}
        style={style}
        direction={direction}
        maxLength={editConfig.maxLength}
        autoSize={editConfig.autoSize}
        enterIcon={editConfig.enterIcon}
      />
    );
  }

  // >>>>>>>>>>> Typography
  // Expand
  const renderExpand = (forceRender?: boolean) => {
    const { expandable, symbol } = ellipsisConfig;

    if (!expandable) return null;

    // force render expand icon for measure usage or it will cause dead loop
    if (!forceRender && (expanded || !isEllipsis)) return null;

    let expandContent: React.ReactNode;
    if (symbol) {
      expandContent = symbol;
    } else {
      expandContent = textLocale.expand;
    }

    return (
      <a
        key="expand"
        className={`${prefixCls}-expand`}
        onClick={onExpandClick}
        aria-label={textLocale.expand}
      >
        {expandContent}
      </a>
    );
  };

  // Edit
  const renderEdit = () => {
    if (!enableEdit) return;

    const { icon, tooltip, triggerType = ['icon'] } = editConfig;

    const title = toArray(tooltip)[0] || textLocale.edit;
    const ariaLabel = typeof title === 'string' ? title : '';

    return triggerType.indexOf('icon') !== -1 ? (
      <Tooltip key="edit" title={tooltip === false ? '' : title}>
        <TransButton
          ref={editIconRef}
          className={`${prefixCls}-edit`}
          onClick={onEditClick}
          aria-label={ariaLabel}
        >
          {icon || <EditOutlined role="button" />}
        </TransButton>
      </Tooltip>
    ) : null;
  };

  // Copy
  const renderCopy = () => {
    if (!enableCopy) return;

    const { tooltips, icon } = copyConfig;

    const tooltipNodes = toList(tooltips);
    const iconNodes = toList(icon);

    const title = copied
      ? getNode(tooltipNodes[1], textLocale.copied)
      : getNode(tooltipNodes[0], textLocale.copy);
    const systemStr = copied ? textLocale.copied : textLocale.copy;
    const ariaLabel = typeof title === 'string' ? title : systemStr;

    return (
      <Tooltip key="copy" title={title}>
        <TransButton
          className={classNames(`${prefixCls}-copy`, copied && `${prefixCls}-copy-success`)}
          onClick={onCopyClick}
          aria-label={ariaLabel}
        >
          {copied
            ? getNode(iconNodes[1], <CheckOutlined />, true)
            : getNode(iconNodes[0], <CopyOutlined />, true)}
        </TransButton>
      </Tooltip>
    );
  };

  const renderOperations = (forceRenderExpanded?: boolean) => [
    renderExpand(forceRenderExpanded),
    renderEdit(),
    renderCopy(),
  ];

  const renderSuffix = (forceRenderExpanded?: boolean) => [
    ellipsisConfig.suffix,
    renderOperations(forceRenderExpanded),
  ];

  return (
    <Ellipsis
      enabled={enableEllipsis}
      text={children}
      suffix={forceRenderExpanded => renderSuffix(forceRenderExpanded)}
    >
      {node => wrapperDecorations(props, node)}
    </Ellipsis>
  );
};

export default Base;
