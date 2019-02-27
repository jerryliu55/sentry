from __future__ import absolute_import

from django.db import transaction
from rest_framework import serializers

from sentry.api.authentication import DSNAuthentication
from sentry.api.bases.monitor import MonitorEndpoint
from sentry.api.paginator import OffsetPaginator
from sentry.api.serializers import serialize
from sentry.models import Monitor, MonitorCheckIn, MonitorStatus, CheckInStatus, ProjectKey


class CheckInSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=(
            ('ok', CheckInStatus.OK),
            ('error', CheckInStatus.ERROR),
            ('in_progress', CheckInStatus.IN_PROGRESS),
        ),
    )
    duration = serializers.IntegerField(required=False)


class MonitorCheckInsEndpoint(MonitorEndpoint):
    authentication_classes = MonitorEndpoint.authentication_classes + (DSNAuthentication,)

    def get(self, request, project, monitor):
        """
        Retrieve check-ins for an monitor
        `````````````````````````````````

        :pparam string monitor_id: the id of the monitor.
        :auth: required
        """
        # we dont allow read permission with DSNs
        if isinstance(request.auth, ProjectKey):
            return self.respond(status=401)

        queryset = MonitorCheckIn.objects.filter(
            monitor_id=monitor.id,
        )

        return self.paginate(
            request=request,
            queryset=queryset,
            order_by='-date_added',
            on_results=lambda x: serialize(x, request.user),
            paginator_cls=OffsetPaginator,
        )

    def post(self, request, project, monitor):
        """
        Create a new check-in for a monitor
        ```````````````````````````````````

        :pparam string monitor_id: the id of the monitor.
        :auth: required
        """
        serializer = CheckInSerializer(
            data=request.DATA,
            context={
                'project': project,
                'request': request,
            },
        )
        if not serializer.is_valid():
            return self.respond(serializer.errors, status=400)

        result = serializer.object

        with transaction.atomic():
            checkin = MonitorCheckIn.objects.create(
                project_id=project.id,
                monitor_id=monitor.id,
                duration=result.get('duration'),
                status=getattr(CheckInStatus, result['status'].upper()),
            )
            if checkin.status == CheckInStatus.ERROR:
                if not monitor.mark_failed(last_checkin=checkin.date_added):
                    return self.respond(serialize(checkin, request.user), status=200)
            else:
                monitor_params = {
                    'last_checkin': checkin.date_added,
                    'next_checkin': monitor.get_next_scheduled_checkin(checkin.date_added),
                }
                if checkin.status == CheckInStatus.OK:
                    monitor_params['status'] = MonitorStatus.OK
                Monitor.objects.filter(
                    id=monitor.id,
                ).exclude(
                    last_checkin__gt=checkin.date_added,
                ).update(**monitor_params)

        return self.respond(serialize(checkin, request.user), status=201)
