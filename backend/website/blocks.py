from wagtail import blocks
from wagtail.images.blocks import ImageChooserBlock


class StatBlock(blocks.StructBlock):
    value = blocks.CharBlock(max_length=20, help_text="e.g. 4.5%, 90 min, 40")
    label = blocks.CharBlock(max_length=60)

    class Meta:
        icon = "form"


class StepBlock(blocks.StructBlock):
    time = blocks.CharBlock(max_length=20, required=False, help_text="e.g. 4.40 am")
    title = blocks.CharBlock(max_length=80)
    body = blocks.TextBlock(required=False)
    image = ImageChooserBlock(required=False)

    class Meta:
        icon = "time"


class TestimonialBlock(blocks.StructBlock):
    quote = blocks.TextBlock()
    name = blocks.CharBlock(max_length=80)
    place = blocks.CharBlock(max_length=80, required=False)

    class Meta:
        icon = "openquote"


class FAQBlock(blocks.StructBlock):
    question = blocks.CharBlock(max_length=200)
    answer = blocks.RichTextBlock(features=["bold", "italic", "link", "ul"])

    class Meta:
        icon = "help"


class SectionBlock(blocks.StructBlock):
    """A generic editorial band the React storefront renders between fixed sections."""

    eyebrow = blocks.CharBlock(max_length=40, required=False)
    heading = blocks.CharBlock(max_length=120)
    body = blocks.RichTextBlock(required=False, features=["bold", "italic", "link"])
    image = ImageChooserBlock(required=False)
    layout = blocks.ChoiceBlock(
        choices=[("left", "Image left"), ("right", "Image right"), ("wide", "Full width")],
        default="right",
    )

    class Meta:
        icon = "doc-full"


class HomeStreamBlock(blocks.StreamBlock):
    stats = blocks.ListBlock(StatBlock(), icon="form")
    process = blocks.ListBlock(StepBlock(), icon="time")
    testimonials = blocks.ListBlock(TestimonialBlock(), icon="openquote")
    faqs = blocks.ListBlock(FAQBlock(), icon="help")
    section = SectionBlock()

    class Meta:
        required = False
