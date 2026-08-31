from django.db import models
from wagtail.admin.panels import FieldPanel, MultiFieldPanel
from wagtail.api import APIField
from wagtail.fields import RichTextField, StreamField
from wagtail.images.api.fields import ImageRenditionField
from wagtail.models import Page

from .blocks import HomeStreamBlock


class HomePage(Page):
    """The storefront. React reads this through /api/cms/pages/."""

    max_count = 1
    subpage_types = ["website.StandardPage"]

    hero_eyebrow = models.CharField(max_length=80, blank=True, default="Suratgarh, Rajasthan")
    hero_heading = models.CharField(max_length=140, default="Milk that never sees a warehouse.")
    hero_subheading = models.TextField(
        blank=True,
        default="Drawn at first light from our own cows and buffaloes, and at your door before the day gets warm.",
    )
    hero_image = models.ForeignKey(
        "wagtailimages.Image", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    hero_cta_label = models.CharField(max_length=40, blank=True, default="Start a subscription")

    story_heading = models.CharField(max_length=140, blank=True, default="One farm. Two milkings. No middle.")
    story_body = RichTextField(blank=True, features=["bold", "italic", "link"])

    body = StreamField(HomeStreamBlock(), blank=True)

    content_panels = Page.content_panels + [
        MultiFieldPanel(
            [
                FieldPanel("hero_eyebrow"),
                FieldPanel("hero_heading"),
                FieldPanel("hero_subheading"),
                FieldPanel("hero_image"),
                FieldPanel("hero_cta_label"),
            ],
            heading="Hero",
        ),
        MultiFieldPanel([FieldPanel("story_heading"), FieldPanel("story_body")], heading="Story"),
        FieldPanel("body"),
    ]

    api_fields = [
        APIField("hero_eyebrow"),
        APIField("hero_heading"),
        APIField("hero_subheading"),
        APIField("hero_cta_label"),
        APIField("hero_image", serializer=ImageRenditionField("fill-1600x1100|format-webp")),
        APIField("story_heading"),
        APIField("story_body"),
        APIField("body"),
    ]


class StandardPage(Page):
    """FAQ, terms, delivery area — anything the team wants to write without a deploy."""

    intro = models.TextField(blank=True)
    body = StreamField(HomeStreamBlock(), blank=True)

    content_panels = Page.content_panels + [FieldPanel("intro"), FieldPanel("body")]
    api_fields = [APIField("intro"), APIField("body")]
