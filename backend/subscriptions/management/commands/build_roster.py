from django.core.management.base import BaseCommand

from subscriptions.services import build_roster


class Command(BaseCommand):
    help = "Generate the delivery roster for the coming days. Run this nightly."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=None)

    def handle(self, *args, **options):
        result = build_roster(days=options["days"])
        # Plain ASCII: this runs on a Windows console that is not always UTF-8.
        self.stdout.write(
            self.style.SUCCESS(
                f"Roster {result['window'][0]} to {result['window'][1]}: "
                f"{result['created']} created, {result['updated']} updated, "
                f"{result['removed']} withdrawn."
            )
        )
