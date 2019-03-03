import React from 'react';
import PropTypes from 'prop-types';
import styled from 'react-emotion';
import _ from 'lodash';

import EventDataSection from 'app/components/events/eventDataSection';
import SentryTypes from 'app/sentryTypes';
import LoadingIndicator from 'app/components/loadingIndicator';
import LoadingError from 'app/components/loadingError';
import {t} from 'app/locale';
import KeyValueList from 'app/components/events/interfaces/keyValueList';

import withApi from 'app/utils/withApi';

const StyledGroupVariantList = styled('ul')`
  padding: 0;
  margin: 0;
  list-style: none;
  font-size: 14px;
  line-height: 18px;
`;

const StyledGroupVariantListItem = styled('li')`
  padding: 0 0 20px 0;
  margin: 0;
`;

const StyledGroupingComponentList = styled('ul')`
  padding: 0;
  margin: 0;
  list-style: none;
`;

const StyledGroupingComponentListItem = styled('li')`
  padding: 0;
  margin: 2px 0 1px 13px;
`;

const StyledGroupingComponent = styled(({contributes, ...props}) => <div {...props} />)`
  color: ${p => (p.contributes ? p.theme.darkWhite : p.theme.gray6)};
`;

const StyledGroupingValue = styled('code')`
  display: inline-block;
  margin: 1px 0 1px 10px;
  font-size: 12px;
  padding: 1px 2px;
  color: inherit;
`;

class GroupingComponent extends React.Component {
  static propTypes = {
    component: PropTypes.object,
  };

  render() {
    const {component} = this.props;

    const children = component.values.map((value, idx) => {
      let rv;
      if (_.isObject(value)) {
        // no point rendering such nodes
        if (!value.contributes && !value.hint && value.values.length === 0) {
          return null;
        }
        rv = <GroupingComponent component={value} />;
      } else {
        rv = <StyledGroupingValue>{JSON.stringify(value, null, 2)}</StyledGroupingValue>;
      }
      return (
        <StyledGroupingComponentListItem key={idx}>{rv}</StyledGroupingComponentListItem>
      );
    });

    return (
      <StyledGroupingComponent contributes={component.contributes}>
        <span>
          {component.name || component.id}
          {component.hint && <small>{` (${component.hint})`}</small>}
        </span>
        <StyledGroupingComponentList>{children}</StyledGroupingComponentList>
      </StyledGroupingComponent>
    );
  }
}

class GroupVariant extends React.Component {
  static propTypes = {
    index: PropTypes.number,
    variant: PropTypes.object,
  };

  renderVariantDetails() {
    const {variant} = this.props;
    switch (variant.type) {
      case 'checksum':
        return <KeyValueList data={{hash: variant.hash}} />;
      case 'component':
        return <GroupingComponent component={variant.component} />;
      case 'custom-fingerprint':
        return <KeyValueList data={{values: variant.values}} isContextData />;
      case 'salted-component':
        return (
          <React.Fragment>
            <KeyValueList data={{values: variant.values}} isContextData />
            <GroupingComponent component={variant.component} />
          </React.Fragment>
        );
      default:
        return null;
    }
  }

  render() {
    const {index, variant} = this.props;
    return (
      <StyledGroupVariantListItem>
        <h5>
          {`#${index + 1} by ${variant.description}`}
          {variant.hash && (
            <small>{` (hash: ${variant.hash}; type: ${variant.type})`}</small>
          )}
        </h5>
        {this.renderVariantDetails()}
      </StyledGroupVariantListItem>
    );
  }
}

class EventGroupingInfo extends React.Component {
  static propTypes = {
    api: PropTypes.object,
    group: SentryTypes.Group.isRequired,
    event: SentryTypes.Event.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {
      isOpen: false,
      loading: false,
      groupInfo: null,
    };
  }

  componentDidMount() {
    this.fetchData();
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (
      this.state.isOpen != nextState.isOpen ||
      this.state.groupInfo !== nextState.groupInfo ||
      this.state.loading !== nextState.loading
    ) {
      return true;
    }
    return this.props.event.id !== nextProps.event.id;
  }

  componentDidUpdate(prevProps) {
    if (this.props.event.id !== prevProps.event.id) {
      this.fetchData();
    }
  }

  toggle = () => {
    this.setState({isOpen: !this.state.isOpen});
  };

  getEndpoint() {
    return `/events/${this.props.event.id}/grouping-info/`;
  }

  fetchData() {
    this.setState({
      loading: true,
    });
    this.props.api.request(this.getEndpoint(), {
      method: 'GET',
      success: data => {
        this.setState({
          error: false,
          loading: false,
          groupInfo: data,
        });
      },
      error: () => {
        this.setState({
          error: true,
          loading: false,
        });
      },
    });
  }

  renderGroupInfoSummary() {
    if (this.state.groupInfo === null) {
      return null;
    }

    const variants = [];
    for (const key of Object.keys(this.state.groupInfo)) {
      const variant = this.state.groupInfo[key];
      if (variant.hash !== null) {
        variants.push(variant.description);
      }
    }

    return (
      <React.Fragment>
        {' '}
        <small>{`(grouped by ${variants.join(', ') || 'nothing'})`}</small>
      </React.Fragment>
    );
  }

  renderGroupInfo() {
    const variants = Object.values(this.state.groupInfo);
    variants.sort((a, b) =>
      (a.name || a.key).toLowerCase().localeCompare((a.name || a.key).toLowerCase())
    );

    return (
      <StyledGroupVariantList>
        {variants.map((variant, index) => (
          <GroupVariant variant={variant} index={index} key={variant.key} />
        ))}
      </StyledGroupVariantList>
    );
  }

  render() {
    const isOpen = this.state.isOpen;
    return (
      <EventDataSection
        group={this.props.group}
        event={this.props.event}
        type="grouping-info"
      >
        <div className="box-header">
          <a className="pull-right errors-toggle" onClick={this.toggle}>
            {isOpen ? t('Hide') : t('Show')}
          </a>
          <h3>
            {t('Grouping Information')}
            {this.renderGroupInfoSummary()}
          </h3>
        </div>
        <div style={{display: isOpen ? 'block' : 'none'}}>
          {this.state.loading && <LoadingIndicator />}
          {this.state.error && <LoadingError onRetry={this.fetchData} />}
          {this.state.groupInfo !== null && isOpen && this.renderGroupInfo()}
        </div>
      </EventDataSection>
    );
  }
}

export default withApi(EventGroupingInfo);
